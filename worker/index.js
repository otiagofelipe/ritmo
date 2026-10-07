/* ══════════════════════════════════════════════════════════════
   RITMO · Worker

   Um Worker só serve a página e a API:
     /            os arquivos de dist/ (o build do Vite), servidos
                  direto pela Cloudflare, sem passar por este código
     /api/...     as rotas abaixo, que falam com o Databricks

   página → este Worker → Databricks SQL Statement API → tabelas.

   Rotas
     GET  /api/dados      lê tudo que o dashboard precisa, numa ida só
     GET  /api/snapshot   a última leitura completa guardada no KV ("foto"),
                          sem passar pelo Databricks
     GET  /api/status     estado do warehouse, sem ligá-lo
     POST /api/ligar      liga o warehouse (a página chama quando ele
                          desliga com ela aberta)
     POST /api/salvar     { op, linhas: [...] } grava na bronze
     GET  /api/eu         quem está logado (para conferir o Access)

   Foto: toda leitura completa do /dados é guardada no KV, e o
   agendamento (Cron Trigger) refaz a leitura a cada 4 horas, depois do
   job da Pluggy. Assim a página abre na hora com a foto enquanto o
   warehouse liga.

   Segurança: a página nunca manda SQL nem nome de tabela. Ela manda a
   chave da operação (op) e os valores; tabela, colunas e tipos estão
   fixos aqui, e todo valor vai como parâmetro nomeado (:nome).

   Secrets: DBX_HOST, DBX_TOKEN, WAREHOUSE_ID (no painel; o deploy não
            mexe neles)
   KV:      RITMO_CACHE (binding do namespace onde fica a foto,
            declarado no wrangler.jsonc)

   Acesso: o Cloudflare Access fica na frente do Worker inteiro
   (página e API) e só deixa entrar quem fez login. Mesmo assim, toda
   rota da API confere o login de novo: se um dia o Access for
   desligado por engano, a página até abre, mas os dados não saem.

   A conferência lê o token que o Access põe em toda requisição
   (cabeçalho Cf-Access-Jwt-Assertion) e valida a assinatura com as
   chaves públicas do seu time (ACCESS_TEAM). O ctx.access não serve
   aqui: com a página servida pelo próprio Worker (static assets), a
   requisição passa por um roteador interno que não o repassa.
   ══════════════════════════════════════════════════════════════ */

// Sem CORS: a página é servida por este mesmo Worker, no mesmo endereço.
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

class Erro extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}


/* ═══════════════ login (Cloudflare Access) ═══════════════ */

const b64url = t => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const textoB64 = t => JSON.parse(new TextDecoder().decode(b64url(t)));

// chaves públicas do time, guardadas por uma hora entre requisições
let chaves = { ts: 0, keys: [] };
async function chavesDoTime(time, forcar) {
  if (!forcar && Date.now() - chaves.ts < 3600e3 && chaves.keys.length) return chaves.keys;
  const r = await fetch(`${time}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`certs do Access: ${r.status}`);
  chaves = { ts: Date.now(), keys: (await r.json()).keys || [] };
  return chaves.keys;
}

/**
 * Quem fez login, ou null. Vale o ctx.access quando ele vier (no
 * `wrangler dev`, com o bloco access.dev); senão, valida o token do
 * cabeçalho: assinatura RS256 com as chaves do time, emissor = o time,
 * não vencido e, com ACCESS_AUD preenchido, para esta aplicação.
 */
async function logado(req, env, ctx) {
  if (ctx.access) {
    const quem = await ctx.access.getIdentity().catch(() => null);
    return { email: quem?.email || "" };
  }

  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  const time = String(env.ACCESS_TEAM || "").replace(/\/+$/, "");
  if (!token || !time) return null;

  const partes = token.split(".");
  if (partes.length !== 3) return null;
  let cab, dados;
  try { cab = textoB64(partes[0]); dados = textoB64(partes[1]); } catch { return null; }
  if (cab.alg !== "RS256") return null;

  // chave trocada pelo Access desde a última busca: busca de novo uma vez
  let jwk = (await chavesDoTime(time)).find(k => k.kid === cab.kid);
  if (!jwk) jwk = (await chavesDoTime(time, true)).find(k => k.kid === cab.kid);
  if (!jwk) return null;

  const chave = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", chave, b64url(partes[2]), new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
  if (!ok) return null;

  const agora = Date.now() / 1000;
  if (dados.iss !== time) return null;
  if (!dados.exp || dados.exp < agora) return null;
  if (env.ACCESS_AUD) {
    const aud = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
  }
  return { email: dados.email || "" };
}


/* ═══════════════ leitura ═══════════════ */

/* Me devem / Eu devo: as views explodem as parcelas; aqui elas voltam a
   ser um registro por id, com a lista das parcelas pagas — é o formato
   que o HTML edita. O SQL só usa nomes fixos, nunca texto da página. */
const dividas = (view, id) => `
Select
    ${id} As id,
    dt_start_month,
    nm_person,
    nm_item,
    vl_amount,
    qt_installments,
    Array_Join(Transform(Array_Sort(Collect_List(Case When fl_paid Then nr_installment End)), x -> Cast(x As String)), ';') As ls_paid_installments
From silver.ritmo.${view}
Group By ${id}, dt_start_month, nm_person, nm_item, vl_amount, qt_installments
Order By dt_start_month, nm_person`;

const LEITURAS = {
  // Select * para que colunas novas da gold (ex.: fl_entertainment) cheguem sozinhas.
  // A hora sai como texto, sem fuso: o valor já está no horário de Brasília.
  transacoes: `
Select * Except (ts_transaction),
    Date_Format(ts_transaction, 'yyyy-MM-dd HH:mm:ss') As ts_transaction
From gold.prod.vw_ritmo`,

  entradas: `
Select dt_competence, vl_part1, vl_part2, vl_caju, vl_additions, vl_deductions, vl_total
From silver.ritmo.vw_income
Order By dt_competence`,

  devem: dividas("vw_receivables", "id_receivable"),
  devo:  dividas("vw_payables", "id_payable"),

  fixos: `
Select id_fixed_expense, nm_invoice, nm_alias, vl_amount, nr_day, fl_third_party,
    dt_start_month, dt_end_month, nm_billing
From silver.ritmo.vw_fixed_expenses
Order By nm_alias, dt_start_month`,

  // cartões ligados/desligados na aba Cartões (última escolha de cada um)
  cartoes: `
Select id_card, nm_card, tp_card, nm_bank, fl_enabled
From silver.ritmo.vw_cards
Order By tp_card, nm_card`,
};


/* ═══════════════ escrita ═══════════════ */

/* Cada tipo valida e normaliza o valor, e diz o tipo SQL do parâmetro.
   Devolver null grava NULL. */
const TIPOS = {
  texto: {
    sql: "STRING",
    ok: v => (v == null || String(v).trim() === "") ? null : String(v).trim().slice(0, 1000),
  },
  valor: {
    sql: "DECIMAL(12,2)",
    ok: v => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) >= 1e10) throw new Error(`valor inválido: ${v}`);
      return n.toFixed(2);
    },
  },
  // desconto: sempre positivo na bronze, a silver subtrai
  positivo: {
    sql: "DECIMAL(12,2)",
    ok: v => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) >= 1e10) throw new Error(`valor inválido: ${v}`);
      return Math.abs(n).toFixed(2);
    },
  },
  inteiro: {
    sql: "INT",
    ok: v => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || Math.abs(n) > 1e6) throw new Error(`inteiro inválido: ${v}`);
      return String(n);
    },
  },
  data: {
    sql: "DATE",
    ok: v => {
      if (!v) return null;
      const s = String(v).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`data inválida: ${v}`);
      return s;
    },
  },
  // competência: aceita aaaa-mm ou aaaa-mm-dd e grava sempre no dia 1
  mes: {
    sql: "DATE",
    ok: v => {
      if (!v) return null;
      const m = String(v).match(/^(\d{4})-(\d{2})/);
      if (!m) throw new Error(`mês inválido: ${v}`);
      return `${m[1]}-${m[2]}-01`;
    },
  },
  flag: {
    sql: "BOOLEAN",
    ok: v => (v === true || v === "true" || v === 1 || v === "1") ? "true" : "false",
  },
  uuid: {
    sql: "STRING",
    ok: v => {
      const s = String(v ?? "").trim().toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) throw new Error(`id inválido: ${v}`);
      return s;
    },
  },
  // Array<Int>: a API não aceita array como parâmetro, então vai como
  // texto "1;2;3" e o Insert converte
  lista: {
    sql: "STRING",
    expr: p => `Transform(Filter(Split(${p}, ';'), x -> x != ''), x -> Cast(x As Int))`,
    ok: v => {
      const itens = (Array.isArray(v) ? v : String(v ?? "").split(";"))
        .map(x => String(x).trim()).filter(Boolean).map(Number);
      if (itens.some(n => !Number.isInteger(n) || n < 1 || n > 1000)) throw new Error(`lista inválida: ${v}`);
      return [...new Set(itens)].sort((a, b) => a - b).join(";");
    },
  },
  // id do catálogo de cartões da página: só letras minúsculas, números e hífen
  slug: {
    sql: "STRING",
    ok: v => {
      const s = String(v ?? "").trim().toLowerCase();
      if (!/^[a-z0-9-]{1,40}$/.test(s)) throw new Error(`id inválido: ${v}`);
      return s;
    },
  },
  tipoCartao: {
    sql: "STRING",
    ok: v => {
      const s = String(v ?? "").trim().toLowerCase();
      if (s === "credit" || s === "benefit") return s;
      throw new Error(`tipo de cartão inválido: ${v}`);
    },
  },
  cobranca: {
    sql: "STRING",
    ok: v => {
      const s = String(v ?? "").trim().toLowerCase();
      if (s === "pix") return "Pix";
      if (s === "" || s === "picpay") return "PicPay";
      throw new Error(`cobrança inválida: ${v}`);
    },
  },
};

/* Operações permitidas: [coluna, tipo, obrigatória]. ts_inserted nunca
   entra — o default da tabela preenche. */
const OPS = {
  caju: {
    tabela: "bronze.ritmo.tb_caju",
    // um Insert por compra, na ordem em que vieram: cada uma ganha o seu
    // ts_inserted (o default da tabela), e a ordem de lançamento fica guardada
    linhaALinha: true,
    colunas: [
      ["nm_merchant",    "texto", true],
      ["vl_amount",      "valor", true],
      ["dt_transaction", "data",  true],
    ],
  },
  entradas: {
    tabela: "bronze.ritmo.tb_income",
    colunas: [
      ["dt_competence", "mes",      true],
      ["vl_part1",      "valor"],
      ["vl_part2",      "valor"],
      ["vl_caju",       "valor"],
      ["vl_additions",  "valor"],
      ["vl_deductions", "positivo"],
      ["fl_deleted",    "flag"],
    ],
  },
  devem: {
    tabela: "bronze.ritmo.tb_receivables",
    colunas: [
      ["id_receivable",        "uuid",    true],
      ["dt_start_month",       "mes",     true],
      ["nm_person",            "texto"],
      ["nm_item",              "texto"],
      ["vl_amount",            "valor",   true],
      ["qt_installments",      "inteiro", true],
      ["ls_paid_installments", "lista"],
      ["fl_deleted",           "flag"],
    ],
  },
  devo: {
    tabela: "bronze.ritmo.tb_payables",
    colunas: [
      ["id_payable",           "uuid",    true],
      ["dt_start_month",       "mes",     true],
      ["nm_person",            "texto"],
      ["nm_item",              "texto"],
      ["vl_amount",            "valor",   true],
      ["qt_installments",      "inteiro", true],
      ["ls_paid_installments", "lista"],
      ["fl_deleted",           "flag"],
    ],
  },
  fixos: {
    tabela: "bronze.ritmo.tb_fixed_expenses",
    colunas: [
      ["id_fixed_expense", "uuid",     true],
      ["nm_invoice",       "texto",    true],
      ["nm_alias",         "texto"],
      ["vl_amount",        "valor",    true],
      ["nr_day",           "inteiro"],
      ["fl_third_party",   "flag"],
      ["dt_start_month",   "mes"],
      ["dt_end_month",     "mes"],
      ["nm_billing",       "cobranca"],
      ["fl_deleted",       "flag"],
    ],
  },
  cartoes: {
    tabela: "bronze.ritmo.tb_cards",
    colunas: [
      ["id_card",    "slug",       true],
      ["nm_card",    "texto",      true],
      ["tp_card",    "tipoCartao", true],
      ["nm_bank",    "texto"],
      ["fl_enabled", "flag"],
    ],
  },
  entertainment: {
    tabela: "bronze.ritmo.tb_entertainment",
    colunas: [
      ["id_transaction",   "texto"],
      ["nm_merchant",      "texto", true],
      ["vl_amount",        "valor", true],
      ["dt_transaction",   "data",  true],
      ["fl_entertainment", "flag"],
    ],
  },
};

const MAX_LINHAS = 500;   // por chamada
const MAX_PARAMS = 250;   // por statement; acima disso o insert é dividido

/** Valida tudo antes de gravar qualquer coisa, depois insere em lotes. */
async function inserir(env, op, linhas) {
  const cfg = OPS[op];
  if (!cfg) throw new Erro(400, `operação desconhecida: ${op}`);
  if (!Array.isArray(linhas) || !linhas.length) throw new Erro(400, "nenhuma linha para gravar");
  if (linhas.length > MAX_LINHAS) throw new Erro(400, `máximo de ${MAX_LINHAS} linhas por chamada`);

  const nomes = cfg.colunas.map(c => c[0]);
  const porLote = cfg.linhaALinha ? 1 : Math.max(1, Math.floor(MAX_PARAMS / nomes.length));
  const lotes = [];

  for (let i = 0; i < linhas.length; i += porLote) {
    const params = [], tuplas = [];
    linhas.slice(i, i + porLote).forEach((linha, r) => {
      if (!linha || typeof linha !== "object") throw new Erro(400, `linha ${i + r + 1} inválida`);
      const exprs = cfg.colunas.map(([nome, tipo, obrig]) => {
        const t = TIPOS[tipo];
        let valor;
        try { valor = t.ok(linha[nome]); }
        catch (e) { throw new Erro(400, `linha ${i + r + 1}, ${nome}: ${e.message}`); }
        if (obrig && valor == null) throw new Erro(400, `linha ${i + r + 1}: ${nome} é obrigatório`);
        const p = `p${r}_${nome}`;
        // parâmetro sem value = NULL
        params.push(valor == null ? { name: p, type: t.sql } : { name: p, value: valor, type: t.sql });
        return `:${p}`;
      });
      tuplas.push(`(${exprs.join(", ")})`);
    });
    /* O Values só leva os parâmetros: tabela inline não aceita função
       com lambda (a conversão da lista para Array<Int>). A conversão
       fica no Select, que lê o Values como uma tabela v. */
    const selecao = cfg.colunas.map(([nome, tipo]) => TIPOS[tipo].expr ? TIPOS[tipo].expr(`v.${nome}`) : `v.${nome}`);
    lotes.push({
      sql: `Insert Into ${cfg.tabela} (${nomes.join(", ")})\n`
         + `Select ${selecao.join(", ")}\n`
         + `From Values\n${tuplas.join(",\n")}\nAs v(${nomes.join(", ")})`,
      params,
    });
  }

  for (const l of lotes) await rodar(env, l.sql, l.params);
  return linhas.length;
}


/* ═══════════════ Statement API ═══════════════ */

const espera = ms => new Promise(ok => setTimeout(ok, ms));

/**
 * Roda um statement e devolve { colunas, linhas }.
 *
 * O warehouse serverless parado leva alguns segundos para ligar: se o
 * statement voltar PENDING/RUNNING depois dos 50 s de espera, consulta
 * de novo até terminar. Resultado grande vem em blocos: segue os links.
 */
async function rodar(env, statement, parameters = []) {
  const base = `${env.DBX_HOST}/api/2.0/sql/statements`;
  const headers = { Authorization: `Bearer ${env.DBX_TOKEN}`, "Content-Type": "application/json" };

  let r = await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      warehouse_id: env.WAREHOUSE_ID,
      statement,
      parameters,
      wait_timeout: "50s",
      on_wait_timeout: "CONTINUE",
      disposition: "INLINE",
      format: "JSON_ARRAY",
    }),
  }).then(x => x.json());

  for (let n = 0; ["PENDING", "RUNNING"].includes(r?.status?.state) && n < 8; n++) {
    await espera(2500);
    r = await fetch(`${base}/${r.statement_id}`, { headers }).then(x => x.json());
  }

  if (r?.status?.state !== "SUCCEEDED")
    throw new Erro(502, r?.status?.error?.message || r?.message || `statement terminou como ${r?.status?.state}`);

  const colunas = (r.manifest?.schema?.columns || []).map(c => c.name);
  const linhas = [...(r.result?.data_array || [])];
  let link = r.result?.next_chunk_internal_link;
  while (link) {
    const bloco = await fetch(env.DBX_HOST + link, { headers }).then(x => x.json());
    linhas.push(...(bloco.data_array || []));
    link = bloco.next_chunk_internal_link;
  }
  return { colunas, linhas };
}

/** Linhas em objetos { coluna: valor }. A API devolve tudo como texto. */
const objetos = ({ colunas, linhas }) =>
  linhas.map(l => Object.fromEntries(colunas.map((c, i) => [c, l[i]])));


/* ═══════════════ leitura completa e foto ═══════════════ */

const CHAVE_FOTO = "dados";

/** Roda todas as LEITURAS em paralelo; uma que falha não derruba as outras. */
async function lerTudo(env) {
  const nomes = Object.keys(LEITURAS);
  const res = await Promise.allSettled(nomes.map(n => rodar(env, LEITURAS[n]).then(objetos)));
  const saida = {}, erros = {};
  res.forEach((x, i) => {
    if (x.status === "fulfilled") saida[nomes[i]] = x.value;
    else { saida[nomes[i]] = []; erros[nomes[i]] = x.reason?.message || String(x.reason); }
  });
  if (Object.keys(erros).length) saida.erros = erros;
  return saida;
}

/**
 * Guarda a leitura como foto. Se alguma parte falhou, ela não apaga o
 * que a foto anterior tinha: a parte que falhou fica como estava. Sem
 * transações não há o que mostrar, então a foto não muda.
 */
async function guardarFoto(env, dados) {
  if (!env.RITMO_CACHE) return;
  const erros = dados.erros || {};
  if (erros.transacoes) return;

  const foto = { ...dados };
  delete foto.erros;
  const falhas = Object.keys(erros);
  if (falhas.length) {
    const anterior = await env.RITMO_CACHE.get(CHAVE_FOTO, "json").catch(() => null);
    for (const k of falhas) foto[k] = anterior?.dados?.[k] || [];
  }
  await env.RITMO_CACHE.put(CHAVE_FOTO, JSON.stringify({ ts: new Date().toISOString(), dados: foto }));
}


/* ═══════════════ rotas ═══════════════ */

export default {
  async fetch(req, env, ctx) {
    const caminho = new URL(req.url).pathname;
    if (!/^\/api(\/|$)/.test(caminho)) return json({ erro: "rota não encontrada" }, 404);
    const rota = caminho.replace(/^\/api/, "").replace(/\/+$/, "");

    try {
      // sem login do Access, nada da API responde
      const quem = await logado(req, env, ctx);
      if (!quem) return json({ erro: "login necessário" }, 401);

      if (req.method === "GET" && rota === "/eu") return json({ email: quem.email });

      if (req.method === "GET" && rota === "/dados") {
        const saida = await lerTudo(env);
        // a resposta não espera a gravação da foto; falha aparece no log do Worker
        ctx.waitUntil(guardarFoto(env, saida).catch(e => console.log("foto não gravada:", e?.message || e)));
        return json(saida);
      }

      // estado do warehouse (RUNNING, STARTING, STOPPING, STOPPED…). Só
      // consulta a API de warehouses: não roda SQL, então não liga nada.
      if (req.method === "GET" && rota === "/status") {
        const r = await fetch(`${env.DBX_HOST}/api/2.0/sql/warehouses/${env.WAREHOUSE_ID}`, {
          headers: { Authorization: `Bearer ${env.DBX_TOKEN}` },
        });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d) throw new Erro(502, d?.message || `o Databricks respondeu ${r.status}`);
        return json({ estado: d.state || "" });
      }

      // religa o warehouse: manda um Select 1 sem esperar a resposta. Rodar
      // um statement liga o warehouse com a mesma permissão do /dados.
      if (req.method === "POST" && rota === "/ligar") {
        const r = await fetch(`${env.DBX_HOST}/api/2.0/sql/statements`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.DBX_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ warehouse_id: env.WAREHOUSE_ID, statement: "Select 1", wait_timeout: "0s" }),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Erro(502, d?.message || `o Databricks respondeu ${r.status}`);
        return json({ ok: true });
      }

      if (req.method === "GET" && rota === "/snapshot") {
        if (!env.RITMO_CACHE)
          return json({ erro: "o KV não está ligado ao Worker: falta o binding RITMO_CACHE em Settings → Bindings" }, 500);
        const foto = await env.RITMO_CACHE.get(CHAVE_FOTO);
        if (!foto) return json({ erro: "ainda não há foto guardada" }, 404);
        // já está em JSON: devolve como veio, sem reprocessar
        return new Response(foto, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      }

      if (req.method === "POST" && rota === "/salvar") {
        const corpo = await req.json().catch(() => null);
        if (!corpo) throw new Erro(400, "corpo inválido");
        const n = await inserir(env, corpo.op, corpo.linhas);
        return json({ ok: true, linhas: n });
      }

      return json({ erro: "rota não encontrada" }, 404);
    } catch (e) {
      return json({ erro: e.message || String(e) }, e.status || 500);
    }
  },

  // Cron Trigger: refaz a foto depois de cada execução do job da Pluggy
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(lerTudo(env).then(d => guardarFoto(env, d)));
  },
};