/* ─────────── recortes ─────────── */

/**
 * Se o lançamento pertence à competência pedida: segue o mês da gold
 * (dt_billing_month / ds_billing_month), esteja a fatura aberta ou
 * fechada.
 */
const daCompetencia = (l, mes) => l.competencia === mes;

/** Lançamentos de uma competência qualquer, já filtrados pelos chips. */
function doComp(comp){
  let l = S.linhas.filter(x=>daCompetencia(x, comp));
  if(!S.incluirPix) l = l.filter(x=>!x.pix);
  if(S.soRole)      l = l.filter(ehRole);
  l = aplicarInclusoes(l, comp);
  return l;
}

/**
 * Chips que começam marcados (Fixos, Parcelas, Itaú, PicPay, Caju):
 * desmarcado, aquele tipo de lançamento sai de todos os números.
 */
/** Parcela de compra feita em mês anterior (2/10, 3/10…). */
const ehParcelaAntiga = x => !!(x.parcela && x.parcela.i > 1);

function aplicarInclusoes(l, comp){
  const inc = S.inc;
  // parcela 1 é compra deste mês; só as de installment_number > 1 saem
  if(!inc.parcelas) l = l.filter(x=>!ehParcelaAntiga(x));
  if(!inc.fixos){
    const ids = idsCobrancasFixas(comp);
    l = l.filter(x=>!x.fixa && !ids.has(x.id));
  }
  return l.filter(x=> !(x.conta && inc[x.conta.id]===false));
}

/** Lançamentos da competência selecionada. */
function doMes(){ return doComp(S.mesSel); }

/**
 * Cobranças de conta fixa que já entraram na fatura desta
 * competência — as linhas marcadas com is_fixed na CONSOLIDADO.
 */
/**
 * Onde procurar a cobrança de uma conta fixa.
 *
 * Antes só valiam as linhas com is_fixed na CONSOLIDADO. Como essa
 * coluna nem sempre vem preenchida, toda conta ficava eternamente
 * "a cobrar" — e, na fatura aberta, "vencida" assim que o dia
 * passava. Agora a busca é em toda a competência e quem decide é o
 * nome; o is_fixed passa a ser reforço, não requisito.
 */
function fixasCobradas(mes){
  return S.linhas.filter(x=>daCompetencia(x, mes || S.mesSel) && !x.contaCorrente);
}

/**
 * O que ainda vai ser cobrado: o cadastro da aba Gastos Fixos menos
 * o que já apareceu na fatura. É esse valor que entra na previsão
 * do card do PicPay.
 */
function fixasPendentes(mes){
  const alvo = mes || S.mesSel;
  // só o que é cobrado no PicPay vira previsão de fatura; o de Pix vai para "Eu devo"
  return fixasVigentes(alvo).filter(f=>!ehFixaPix(f) && !cobrancaDaFixa(f, alvo));
}

/**
 * Onde a conta fixa é paga. Registro antigo não tem o campo e continua
 * no PicPay, que era o único jeito antes desta opção.
 */
const COBRANCAS_FIXA = [["picpay","PicPay"],["pix","Pix"]];
const cobrancaFixa = f => String(f && f.cobranca || "").trim().toLowerCase()==="pix" ? "pix" : "picpay";
const ehFixaPix = f => cobrancaFixa(f)==="pix";

/**
 * Contas fixas pagas por Pix, como itens de "Eu devo" do mês. São
 * lidas da aba Gastos Fixos a cada vez: não moram em Registros, não
 * aparecem no editor de "Eu devo" e mudam só pelo editor de fixos.
 * Ficam pagas quando a transferência aparece no extrato do mês.
 */
function fixasPixComoDevo(mes){
  return fixasVigentes(mes).filter(ehFixaPix).map(f=>({
    nome: rotuloFixa(f), pessoa: "",
    // depois de pago, vale o que saiu de fato; antes, o previsto
    valor: (c => c ? Math.abs(c.valor) : (Number(f.valor)||0))(cobrancaDaFixa(f, mes)),
    fixaPix: true, pago: !!cobrancaDaFixa(f, mes), mesRef: mes
  }));
}

/**
 * Ids dos lançamentos que são cobrança de conta fixa numa
 * competência. O is_fixed da CONSOLIDADO vem vazio, então quem
 * identifica é o casamento por nome do cadastro.
 */
function idsCobrancasFixas(mes){
  const set = new Set();
  for(const f of fixasVigentes(mes)){
    const c = cobrancaDaFixa(f, mes);
    if(c) set.add(c.id);
  }
  return set;
}

/**
 * Lançamentos de "Eu devo" que ficam de fora do total sem parcelas e
 * fixos: contas de consumo anotadas à mão, fixas por natureza mesmo
 * sem estar no cadastro de contas fixas.
 */
const DEVO_RECORRENTE = /\benel\b/i;

/** Quanto de conta fixa ainda deve cair numa competência. */
const fixasPrevistas = mes =>
  fixasPendentes(mes).reduce((a,f)=>a+(Number(f.valor)||0),0);

/** Só os 7 primeiros caracteres: "2026-08-01" e "2026-08" viram a mesma competência. */
const compDe = v => String(v||"").slice(0,7);

/**
 * Uma conta fixa vale de `inicio` até `fim`, ambos opcionais. Registro
 * antigo não tem nenhum dos dois e continua valendo para sempre, que é
 * exatamente como ele se comportava antes de existir vigência.
 *
 * É isto que preserva o histórico: encerrar a Netflix hoje põe um fim
 * em `fim`, e os meses anteriores continuam contando com ela.
 */
function vigenteEm(f, mes){
  const ini = compDe(f.inicio), fim = compDe(f.fim);
  if(ini && mes < ini) return false;
  if(fim && mes > fim) return false;
  return true;
}

/** O que aparece na tela; `nome` continua sendo o que casa com a CONSOLIDADO. */
const rotuloFixa = f => String(f.apelido||"").trim() || nomesFatura(f)[0] || "";

/**
 * Textos de fatura de uma conta fixa. A mesma conta pode vir com mais de
 * uma descrição (NETFLIX.COM, Netflix Entretenimento…): ficam juntas no
 * nm_invoice, separadas por ";", e qualquer uma delas casa.
 */
const SEP_FATURA = "; ";
const nomesFatura = f => String(f && f.nome || "").split(";").map(t=>t.trim()).filter(Boolean);

/**
 * Contas fixas em vigor numa competência.
 *
 * A mesma despesa pode ter várias linhas — uma por faixa de valor,
 * porque a Netflix de 2026 não custa o mesmo que a de 2025. Se duas
 * faixas se sobrepuserem por engano, vale a de início mais recente,
 * senão a conta seria somada duas vezes.
 */
function fixasVigentes(mes){
  const alvo = mes || S.mesSel;
  const porDespesa = new Map();
  for(const f of itensGrupo("fixos")){
    if(!vigenteEm(f, alvo)) continue;
    const k = chaveFixa(f);
    const atual = porDespesa.get(k);
    if(!atual || compDe(f.inicio) > compDe(atual.inicio)) porDespesa.set(k, f);
  }
  return [...porDespesa.values()];
}

/**
 * O que diz que duas linhas são a mesma despesa: o nome de exibição.
 * O texto que vem na fatura muda — a Netflix já foi NETFLIX.COM e
 * hoje é outra coisa — então ele não serve de identidade.
 */
const chaveFixa = f =>
  String(f.apelido || nomesFatura(f)[0] || "").trim().toLowerCase();

/**
 * Casa uma conta fixa cadastrada com a cobrança correspondente.
 * Compara pelo começo do nome; havendo mais de uma candidata,
 * vence a de valor mais próximo do previsto — "Google" casaria
 * tanto com "Google Disney" quanto com "GOOGLE Google".
 */
function cobrancaDaFixa(f, mes){
  // o texto da fatura é o que casa; o apelido é só para a tela
  const alvos = nomesFatura(f).map(n=>norm(n).trim().slice(0,18)).filter(a=>a.length>=4);
  if(!alvos.length) return null;
  // paga por Pix: procura a transferência, não a fatura do cartão
  const base = ehFixaPix(f)
    ? S.linhas.filter(x=>daCompetencia(x, mes || S.mesSel) && (x.pix || x.contaCorrente))
    : fixasCobradas(mes);
  let cand = base.filter(c=>{ const d = norm(c.desc); return alvos.some(a=>d.includes(a)); });
  // havendo linha marcada como fixa, ela ganha das outras
  const marcadas = cand.filter(c=>c.fixa);
  if(marcadas.length) cand = marcadas;
  if(!cand.length) return null;
  /* Compara pelo valor absoluto: no extrato da conta a saída do Pix
     vem negativa, e com sinal a transferência de verdade (-533) perdia
     para um estorno pequeno (-9,76), que ficava "mais perto" do previsto. */
  const previsto = Math.abs(Number(f.valor)||0);
  return cand.reduce((m,c)=>
    Math.abs(Math.abs(c.valor)-previsto) < Math.abs(Math.abs(m.valor)-previsto) ? c : m);
}

/**
 * Um lançamento é rolê quando a CONSOLIDADO diz que é (coluna
 * is_entertainment, que vem da Open Finance) ou quando você marcou
 * aqui no app. A marcação vive na aba Rolês, porque a CONSOLIDADO
 * é reescrita e o app não pode alterá-la.
 */
/**
 * É rolê quando a CONSOLIDADO marcou is_entertainment ou quando eu
 * marquei à mão. A desmarcação manual ganha das duas: sem ela não
 * haveria como tirar o rolê de uma linha que veio marcada da
 * planilha, já que aquela coluna é escrita pelo Databricks.
 */
/* A marcação manual é guardada por descrição + valor + data da compra,
   não pelo transaction_id: o Open Finance troca o id de vez em quando e
   a marcação se perdia. A chave normaliza espaços e maiúsculas para a
   mesma compra casar mesmo se o banco mexer na grafia. */
const diaISO = d => d ? `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}` : "";
const chaveRoleDe = (desc, valor, dia) =>
  `${String(desc||"").trim().replace(/\s+/g," ").toLowerCase()}|${(Number(valor)||0).toFixed(2)}|${String(dia||"").slice(0,10)}`;
const chaveRole = l => chaveRoleDe(l.desc, l.valor, diaISO(l.data));
const ehRole = l => {
  const k = chaveRole(l);
  if(S.rolesFora.has(k)) return false;
  return !!(l.role || S.roles.has(k));
};

const soma = arr => arr.reduce((a,x)=>a+x.valor,0);
const somaConta = (l,id) => soma(l.filter(x=>x.conta && x.conta.id===id));

/**
 * "Agosto - Set/26": a competência e o mês em que a fatura vence,
 * com o ano do vencimento — sem ele, dezembro e janeiro viram a
 * mesma coisa na lista.
 */
function rotuloFatura(comp){
  const p = partesFatura(comp);
  return p ? `${p.mes} - ${p.venc}` : "—";
}

/** Igual, mas com o vencimento em itálico. Só onde cabe HTML. */
function rotuloFaturaHTML(comp){
  const p = partesFatura(comp);
  return p ? `${esc(p.mes)} - <i>${esc(p.venc)}</i>` : "—";
}

function partesFatura(comp){
  if(!comp) return null;
  const [a,m]=String(comp).split("-").map(Number);
  if(!a||!m) return null;
  const venc = m===12 ? 1 : m+1;
  const ano  = m===12 ? a+1 : a;
  const cap = t => t.charAt(0).toUpperCase()+t.slice(1);
  return { mes: cap(MES_L[m-1]), venc: `${cap(MES[venc-1])}/${String(ano).slice(2)}` };
}

/**
 * Semanas da competência, de segunda a domingo, cobrindo o mês
 * inteiro — inclusive as que ainda não aconteceram. É a mesma
 * definição usada pelo gráfico semanal e pelo filtro da lista.
 */
function semanasDoMes(comp){
  const [ano,mes] = String(comp||"").split("-").map(Number);
  if(!ano||!mes) return [];
  const saida=[];
  let cursor = new Date(ano, mes-1, 1);
  cursor.setDate(cursor.getDate() - ((cursor.getDay()+6)%7));   // recua p/ segunda
  const fimMes = new Date(ano, mes, 0);
  while(cursor <= fimMes){
    const fim = new Date(cursor); fim.setDate(fim.getDate()+6);
    saida.push({
      rot: `${p2(cursor.getDate())}/${p2(cursor.getMonth()+1)} - ${p2(fim.getDate())}/${p2(fim.getMonth()+1)}`,
      ini: new Date(cursor), fim
    });
    cursor = new Date(fim); cursor.setDate(cursor.getDate()+1);
  }
  return saida;
}

/**
 * Em que semana um lançamento cai. Vale a semana que veio da planilha
 * quando ela existe no eixo; o que sobrar vai para a borda mais
 * próxima, para nenhum valor sumir do total.
 */
function semanaDe(l, semanas){
  const i = semanas.findIndex(s=>s.rot===l.semana);
  if(i>=0) return i;
  /* Parcela é datada pela compra original, que fica fora do mês — pela
     data dela, toda parcela cairia na primeira semana e sumiria das
     outras no filtro. A semana de uma parcela é a em que ela entra na
     fatura, então aqui vale a billing_date. */
  const d = (l.parcela && l.dataFatura) ? l.dataFatura : l.data;
  const dentro = semanas.findIndex(s=>d>=s.ini && d<=s.fim);
  if(dentro>=0) return dentro;
  return d < semanas[0].ini ? 0 : semanas.length-1;
}

/**
 * O gasto que de fato nasceu neste mês: fora as parcelas de compras
 * antigas e fora as contas fixas. Usado nos KPIs progressivos e no
 * gráfico diário — não altera o total geral do mês.
 */
const gastoProprio = linhas => linhas.filter(x=>!x.parcela && !x.fixa);

/**
 * Lançamentos dos gráficos "Gastos por semana" e "Ritmo do mês": o gasto
 * que nasceu no mês. Fixos e parcelas de compras antigas (2/10, 3/10…)
 * ficam sempre de fora; a 1ª parcela entra, porque é compra do mês.
 * Os outros botões (bancos, Rolê, Pix) valem normalmente via doMes().
 */
function linhasDosGraficos(){
  // fixos = coluna is_fixed E as cobranças que casam com a aba Gastos Fixos
  const ids = idsCobrancasFixas(S.mesSel);
  return doMes().filter(x=>!x.fixa && !ids.has(x.id) && !ehParcelaAntiga(x));
}

