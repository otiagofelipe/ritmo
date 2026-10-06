/* ═══════════ carregamento ═══════════ */
function banner(tipo, html){
  const b=$("banner");
  b.classList.toggle("hidden", !tipo);
  if(tipo){ b.className="banner "+tipo; b.innerHTML=html; }
}
function msg(tipo,texto){
  $("msg").innerHTML = `<div class="banner ${tipo}" style="margin:12px 0 0">${esc(texto)}</div>`;
}

/* ─────────── Worker ─────────── */

/**
 * Chamada ao Worker. `corpo` presente = POST com JSON.
 * Erro de rede e resposta com `erro` viram exceção com mensagem legível.
 */
async function api(caminho, corpo){
  let r;
  try{
    r = await fetch(API + caminho, {
      method: corpo ? "POST" : "GET",
      headers: corpo ? {"Content-Type":"application/json"} : {},
      body: corpo ? JSON.stringify(corpo) : undefined
    });
  }catch(e){
    throw new Error("Não consegui falar com o Worker. Confira a internet e tente de novo.");
  }
  const d = await r.json().catch(()=>null);
  if(!r.ok || !d) throw new Error((d && d.erro) || `O Worker respondeu ${r.status}.`);
  return d;
}

function aplicarDados(d){
  ingerir(d.transacoes);
  ingerirRegistros(d);
  recompor();
}

/** "14:20" se for de hoje; "30/09 14:20" se for de outro dia. */
function quando(iso){
  const t = new Date(iso);
  if(isNaN(t)) return "";
  const hm = `${p2(t.getHours())}:${p2(t.getMinutes())}`;
  return t.toDateString()===new Date().toDateString() ? hm : `${p2(t.getDate())}/${p2(t.getMonth()+1)} ${hm}`;
}

/**
 * Situação dos dados, ao lado do título: de quando são os dados na tela
 * e se o warehouse já respondeu. Substitui o aviso grande de carga — o
 * banner fica só para erro.
 */
const SYNC = {
  ts: null, vivo: false,
  estado: "",     // da leitura: ligando (em curso) | ok | erro
  wh: ""          // estado real do warehouse, do /status: RUNNING, STARTING, STOPPED…
};

/** O que a linha "cluster" mostra, juntando a leitura em curso e o estado real. */
function estadoCluster(){
  if(SYNC.wh === "RUNNING") return "ligado";
  if(SYNC.wh === "STARTING" || SYNC.estado === "ligando") return "ligando";
  if(SYNC.estado === "erro") return "erro";
  if(["STOPPED","STOPPING","DELETED","DELETING"].includes(SYNC.wh)) return "desligado";
  return SYNC.estado === "ok" ? "ligado" : "";
}

function renderSync(){
  const el = $("sync");
  if(!el) return;
  let atual = "—";
  if(SYNC.ts){
    const t = new Date(SYNC.ts);
    atual = (SYNC.vivo && Date.now() - t < 60000) ? "agora" : quando(SYNC.ts);
  }
  const cluster = {
    ligando:   `<span class="sync-ic spin" aria-hidden="true"></span>ligando`,
    ligado:    `<svg class="sync-ic ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>ligado`,
    desligado: `<span class="sync-ic off" aria-hidden="true"></span>desligado`,
    erro:      `<svg class="sync-ic err" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>não respondeu`
  }[estadoCluster()] || "—";
  el.innerHTML = `<div><span class="sync-k">atualizado em</span> ${esc(atual)}</div>`
               + `<div><span class="sync-k">cluster</span> ${cluster}</div>`;
}

/**
 * Pergunta ao Worker o estado do warehouse (só lê, não liga) a cada 10 s
 * com a página aberta. Se ele desligou com a página visível, manda
 * religar — a página fica aberta poucos minutos por dia, então manter o
 * warehouse ligado nesse tempo sai barato. Com a aba escondida, não
 * pergunta nem religa: aí o warehouse desliga sozinho.
 */
let ultimoLigar = 0;
async function verificarCluster(){
  if(document.hidden) return;
  try{
    const d = await api("/status");
    SYNC.wh = String(d.estado||"").toUpperCase();
  }catch(e){ /* sem resposta do status, fica o que a leitura disse */ }

  // ligou: o pedido anterior já fez efeito, então o próximo desligamento pode religar na hora
  if(SYNC.wh === "RUNNING") ultimoLigar = 0;

  const parado = ["STOPPED","STOPPING"].includes(SYNC.wh);
  // um pedido por minuto no máximo: enquanto ele sobe, o status ainda pode dizer STOPPED
  if(parado && !carregando && Date.now() - ultimoLigar > 60000){
    ultimoLigar = Date.now();
    try{ await api("/ligar", {}); SYNC.wh = "STARTING"; }catch(e){ /* tenta de novo no próximo minuto */ }
  }
  renderSync();
}
setInterval(()=>{ renderSync(); verificarCluster(); }, 10000);

/**
 * Lê tudo numa ida só. Na primeira carga, a foto guardada no Worker
 * (/snapshot, a última leitura completa) aparece na hora enquanto o
 * warehouse liga; quando a leitura ao vivo chega, ela substitui a foto.
 */
let carregando = false;
async function carregar(){
  if(carregando) return;
  carregando = true;
  let vivo = false;       // a leitura ao vivo já terminou (bem ou mal)
  SYNC.estado = "ligando";
  renderSync();

  if(!S.consolidado.length){
    api("/snapshot").then(f=>{
      if(vivo || !f || !f.dados) return;   // o ao vivo chegou antes: a foto não serve mais
      aplicarDados(f.dados);
      SYNC.ts = f.ts; SYNC.vivo = false;
      renderSync();
      resumoFonte();
      render();
    }).catch(()=>{});                       // sem foto, segue só com o ao vivo
  }

  try{
    const d = await api("/dados");
    vivo = true;
    aplicarDados(d);
    ultimaCarga = Date.now();
    SYNC.ts = new Date().toISOString(); SYNC.vivo = true; SYNC.estado = "ok"; SYNC.wh = "RUNNING";
    banner(d.erros ? "err" : null, d.erros
      ? "Parte dos dados não carregou: " + Object.entries(d.erros)
          .map(([k,v])=>`<b>${esc(k)}</b> (${esc(v)})`).join(" · ")
      : "");
    msg("load", `${S.linhas.length} lançamentos, ${S.faturas.length} faturas.`);
    resumoFonte();
    render();
  }catch(e){
    vivo = true;
    SYNC.estado = "erro";
    banner("err", esc(e.message));
    msg("err", e.message);
    render();
  }finally{
    renderSync();
    carregando = false;
  }
  verificarCluster();
}
let ultimaCarga = 0;

function resumoFonte(){
  const rail = $("rail-info");
  if(!S.linhas.length){
    $("resumo-fonte").textContent="";
    if(rail) rail.textContent="sem dados";
    return;
  }
  const metodos=[...new Set(S.linhas.map(l=>l.cartao || l.metodo))];
  $("resumo-fonte").innerHTML =
    `<b>${S.linhas.length}</b> lançamentos · ${S.faturas.length} faturas · `
    + metodos.map(esc).join(", ");
  if(rail) rail.textContent = `${S.linhas.length} lançamentos · ${S.faturas.length} faturas`;
}

