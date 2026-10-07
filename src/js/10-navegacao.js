/* ═══════════════════════════════════════════════════════════
   NAVEGAÇÃO

   Uma página por seção, todas já no HTML: trocar é mostrar uma e
   esconder as outras. O estado (mês, chips, busca) é global, então
   ir e voltar não perde nada.
   ═══════════════════════════════════════════════════════════ */

const PAGINAS = [
  { id:"dash",  titulo:"Dashboard",    filtros:true  },
  { id:"fixos", titulo:"Gastos fixos", filtros:true  },
  { id:"devem", titulo:"Me devem",     filtros:true  },
  { id:"devo",  titulo:"Eu devo",      filtros:true  },
  { id:"evo",   titulo:"Mês a mês",    filtros:true  },
  { id:"entradas", titulo:"Entradas",  filtros:true  },
  { id:"caju",  titulo:"Caju",         filtros:true  },
  { id:"dados", titulo:"Dados",        filtros:false }
];
var pagina = "dash";

function irPara(id){
  if(!PAGINAS.some(p=>p.id===id)) id = "dash";
  pagina = id;
  const p = PAGINAS.find(x=>x.id===id);

  PAGINAS.forEach(x=>$("pg-"+x.id).classList.toggle("hidden", x.id!==id));
  document.querySelectorAll("#menu button, #tabbar button[data-pg], #tb-menu button").forEach(b=>
    b.setAttribute("aria-current", String(b.dataset.pg===id)));
  // página que mora no "Mais": o botão dele fica aceso
  const mais = $("tb-mais");
  if(mais) mais.setAttribute("aria-current", String(mais.dataset.mais.split(" ").includes(id)));
  fecharMenuMais();
  $("pg-titulo").textContent = p.titulo;
  $("barra-filtros").classList.toggle("hidden", !p.filtros);

  document.body.classList.remove("drawer");
  if(S.editando && pagina !== S.editando) S.editando = null;
  render();
  window.scrollTo({top:0, behavior:"instant"});
}

/* ═══ render ═══ */
function render(){
  if(!S.linhas.length){
    $("m-total").innerHTML = dinheiro(0);
    $("m-titulo").textContent = "sem dados";
    $("m-lista").innerHTML = `<div class="blank">Nenhum dado carregado.
      Abra <b>Dados</b> no menu para conectar ao Databricks.</div>`;
    return;
  }
  protegido("seletor", montarSeletor);
  protegido("chips",   renderChips);
  protegido("barra do celular", renderBarraCel);

  if(pagina==="dash"){
    protegido("resumo",   renderResumo);
    protegido("dia",      renderDia);
    protegido("semanas",  renderSemanas);
    protegido("filtros da lista", renderFiltrosLista);
    protegido("extrato",  renderExtrato);
    protegido("parcelas", renderParcelas);
    protegido("fixas",    renderFixasResumo);
  }
  if(pagina==="fixos") protegido("gastos fixos", pgFixos);
  if(pagina==="devem") protegido("me devem",     ()=>pgQuadro("devem"));
  if(pagina==="devo")  protegido("eu devo",      ()=>pgQuadro("devo"));
  if(pagina==="evo")   protegido("mês a mês",    pgEvolucao);
  if(pagina==="entradas") protegido("entradas",  pgEntradas);
  if(pagina==="caju")  protegido("caju",         pgCaju);

  renderEditor();
}

/**
 * Barra do celular: a faixa de resumo (posso gastar e o que sobra no
 * Caju) e os selos de Me devem e Eu devo, que moram no "Mais".
 */
function renderBarraCel(){
  const fx = $("tb-resumo");
  if(!fx) return;
  const c = contasDoMes();
  /* Total: a mesma conta do card de total do Dashboard (faturas + eu
     devo − me devem + gasto no Caju). No celular ele e o saldo vivem só
     aqui; os cards do topo ficam escondidos. */
  const total = c.faturas + c.devo - c.devem + c.gastoCaju;
  const quando = S.mesSel===S.mesAberto ? `dia ${TODAY.getDate()}` : "mês fechado";
  /* Semana: o que ainda cabe no target de R$ 600 da semana em curso. O
     gasto é a mesma soma do gráfico "Gastos por semana" (sem parcelas
     nem fixos, com os botões do topo). Fica no meio, acima do "+". */
  const semanas = semanasDoMes(S.mesSel);
  const k = semanas.findIndex(w => TODAY>=w.ini && TODAY<=new Date(w.fim.getFullYear(),w.fim.getMonth(),w.fim.getDate(),23,59));
  let semanaHTML = `<b>semana</b><i>—</i>`;   // competência sem a semana de hoje
  if(k >= 0){
    const gasto = linhasDosGraficos().filter(l=>semanaDe(l, semanas)===k).reduce((a,l)=>a+l.valor,0);
    const livre = TARGET_SEMANA - gasto;
    const pSem = Math.max(0, Math.min(1, livre / TARGET_SEMANA));
    semanaHTML = `<b>semana</b><i class="${livre<0?"neg":""}">${esc(BRL.format(livre))}</i>
      <span class="r-trilho" title="gasto ${esc(BRL.format(gasto))} de ${esc(BRL.format(TARGET_SEMANA))}"><span style="width:${(pSem*100).toFixed(1)}%"></span></span>`;
  }
  const valor = v => `<i class="r-vl${v<0?" neg":""}">${esc(BRL.format(v))}</i>`;
  fx.innerHTML = `<div class="r-tot"><b>total</b>${valor(total)}<small>${quando}</small></div>
    <div class="r-sem">${semanaHTML}</div>
    <div class="r-saldo"><b>saldo do mês</b>${valor(c.posso)}</div>`;

  // selos: pessoas que me devem e coisas que eu devo, ainda pendentes no mês
  const pendente = i => !i.pago && (Number(i.valor)||0) > 0;
  const pessoas = new Set(itensDoMes("devem").filter(pendente).map(i=>rotuloPessoa(i)).filter(Boolean)).size;
  const coisas = itensDoMes("devo").filter(pendente).length;
  const selo = (id, n, tit) => {
    const el = document.querySelector(`#tb-menu [data-pg="${id}"] .tb-selo`);
    if(el){ el.textContent = n ? String(n) : ""; el.title = n ? tit : ""; }
  };
  selo("devem", pessoas, `${pessoas} pessoa${pessoas===1?"":"s"} me deve${pessoas===1?"":"m"}`);
  selo("devo", coisas, `${coisas} ${coisas===1?"coisa":"coisas"} que eu devo`);
  const ponto = $("tb-mais-ponto");
  if(ponto) ponto.hidden = !(pessoas || coisas);

  // altura da barra inteira: os menus e o aviso abrem logo acima dela
  const barra = $("tabbar");
  if(barra && barra.offsetHeight) document.documentElement.style.setProperty("--tb-h", barra.offsetHeight+"px");
}

/** Isola cada bloco: erro num deles não derruba a tela inteira. */
function protegido(nome, fn){
  try{ fn(); }
  catch(e){
    console.error("[ritmo] "+nome, e);
    banner("err","Erro ao montar <b>"+esc(nome)+"</b>: "+esc(e.message));
  }
}

/**
 * Total em destaque: ao trocar de mês, conta do valor anterior até o novo
 * (Mola); em qualquer outro redesenho, só escreve.
 */
let totalMostrado = null, mesDoTotal = null, totalRaf = 0;
function contarTotal(v){
  const el = $("m-total");
  cancelAnimationFrame(totalRaf);
  const de = totalMostrado, trocouMes = mesDoTotal !== null && mesDoTotal !== S.mesSel;
  totalMostrado = v; mesDoTotal = S.mesSel;
  if(!trocouMes || de === null || de === v || matchMedia("(prefers-reduced-motion: reduce)").matches){
    el.innerHTML = dinheiro(v); return;
  }
  const t0 = performance.now(), dur = 550;
  const passo = agora => {
    const p = Math.min(1, (agora - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.innerHTML = dinheiro(de + (v - de) * e);
    if(p < 1) totalRaf = requestAnimationFrame(passo);
  };
  totalRaf = requestAnimationFrame(passo);
}

function dinheiro(v){
  const s=BRL.format(v), i=s.lastIndexOf(",");
  return s.slice(0,i)+`<span class="cents">${s.slice(i)}</span>`;
}

function montarSeletor(){
  const sel=$("f-month");
  // o nome vem do ds_billing_month da gold; mês sem ele (ex.: só Caju
  // ou só cadastro) cai no rótulo calculado aqui
  const rotulos = S.rotulosFatura || {};
  // a fatura aberta leva uma etiqueta na lista
  sel.innerHTML = S.faturas.map(f=>`<option value="${f}"${f===S.mesAberto?' data-tag="aberta"':""}>${esc(rotulos[f] || rotuloFatura(f))}</option>`).join("");
  sel.value = S.mesSel;
  const i = S.faturas.indexOf(S.mesSel);
  document.querySelectorAll(".f-mes-seta").forEach(b=>{
    const j = i + Number(b.dataset.d); b.disabled = !(j>=0 && j<S.faturas.length); });
}

function renderChips(){
  const pix = S.linhas.filter(x=>daCompetencia(x, S.mesSel) && x.pix);
  $("cnt-pix").textContent = pix.length ? String(pix.length) : "";
  $("chip-pix").classList.toggle("off", !S.incluirPix);
  const roles = S.linhas.filter(x=>daCompetencia(x, S.mesSel) && ehRole(x));
  $("cnt-role").textContent = roles.length ? String(roles.length) : "";
  $("chip-role").classList.toggle("off", !S.soRole);
  $("f-role").checked = S.soRole;
  $("f-pix").checked  = S.incluirPix;
  // novos chips: contagem na competência e marcado/desmarcado
  const doMesBruto = S.linhas.filter(x=>daCompetencia(x, S.mesSel) && (S.incluirPix || !x.pix));
  const ids = idsCobrancasFixas(S.mesSel);
  const conta = {
    fixos:    doMesBruto.filter(x=>x.fixa || ids.has(x.id)).length
              + itensDoMes("devo").filter(ehDevoFixo).length,
    parcelas: doMesBruto.filter(ehParcelaAntiga).length,
    itau:     doMesBruto.filter(x=>x.conta && x.conta.id==="itau").length,
    picpay:   doMesBruto.filter(x=>x.conta && x.conta.id==="picpay").length,
    caju:     doMesBruto.filter(x=>x.conta && x.conta.id==="caju").length,
    devo:     itensDoMes("devo").length,
    devem:    itensDoMes("devem").length
  };
  Object.keys(S.inc).forEach(k=>{
    $("cnt-"+k).textContent = conta[k] ? String(conta[k]) : "";
    $("chip-"+k).classList.toggle("off", !S.inc[k]);
    $("f-"+k).checked = S.inc[k];
  });
  // funil: quantos filtros estão ligados
  const nLig = document.querySelectorAll("#barra-filtros .chips input:checked").length;
  $("f-funil-n").textContent = String(nLig);
  $("f-funil").title = `${nLig} de 9 filtros ligados`;
  // selo das contas dentro dos chips (uma vez)
  document.querySelectorAll(".chip-marca:empty").forEach(el=>{
    const c = CONTAS.find(x=>x.id===el.dataset.conta);
    if(c) el.innerHTML = marca(c, true);
  });
}

/**
 * Selo da conta. Usa o logotipo quando há um preenchido em LOGOS;
 * senão desenha um quadradinho com a inicial na cor da conta —
 * marca própria, não o logo do banco.
 */
const LETRA = { itau:"I", picpay:"P", caju:"C" };
function marca(conta, pequena){
  if(!conta) return "";
  const cls = "marca" + (pequena ? " sm" : "");
  const l = LETRA[conta.id] || String(conta.titulo||"?").charAt(0).toUpperCase();
  const base = `style="background:${conta.cor}26;color:${conta.cor}" title="${esc(conta.titulo)}"`;
  const logo = LOGOS[conta.id];
  // a letra fica por baixo: se a imagem não carregar, ela reaparece
  if(logo)
    return `<i class="${cls} img" ${base}>${esc(l)}<img src="${esc(logo)}"
      alt="${esc(conta.titulo)}" loading="lazy"
      onerror="this.parentNode.classList.remove('img');this.remove()"></i>`;
  return `<i class="${cls}" ${base}>${esc(l)}</i>`;
}

/**
 * Selo de ajuda com a fórmula. Abre no hover e no foco pelo teclado,
 * que é o que salva o celular, onde hover não existe.
 */
const dica = txt =>
  `<span class="info" tabindex="0" role="note" data-dica="${esc(txt)}"
     aria-label="${esc(txt)}">i</span>`;

/** Monta um cartão de indicador. */
/* Cards de banco abertos (Itaú, PicPay): ficam abertos entre um redesenho e outro */
const KPI_ABERTO = new Set();
// sem o "R$": no card estreito do computador o valor inteiro precisa caber
const NUM2 = new Intl.NumberFormat("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});

/* Cor do canto aceso de cada card do Dashboard: a do logo nos bancos
   (Itaú laranja, PicPay verde) e as cores de sempre no resto. */
const TOM_CARD = { itau:"#EC7000", picpay:"#11C76F", caju:"var(--c-caju)", devo:"var(--c-devo)", devem:"var(--c-devem)" };

/* apos: HTML logo depois do nome (ex.: o fornecedor do benefício);
   pe: HTML no fim do card (ex.: a barra de quanto do teto já foi) */
function kpi({nome, cor, valor, sub, extra, acao, destaque, sinal, selo, ajuda, fmt, tom, abre, apos, pe}){
  const tag = acao ? "button" : "div";
  const cls = "kpi" + (acao?" clicavel":"") + (destaque?" destaque":"")
    + (!valor && !destaque ? " zero" : "") + (tom && !destaque ? " tom" : "")
    + (abre ? " abre" + (KPI_ABERTO.has("bancos") ? " aberto" : "") : "");
  // tom: a cor do ícone do card, que acende no canto de cima
  return `<${tag} class="${cls}"${acao?` data-acao="${esc(acao)}"`:""}${tom && !destaque ? ` style="--k:${tom}"` : ""}${
      abre ? ` aria-expanded="${KPI_ABERTO.has("bancos")}"` : ""}>
    <div class="nm">${selo || (cor?`<i class="dot" style="background:${cor}"></i>`:"")}${esc(nome)}${apos||""}${
      ajuda?" "+dica(ajuda):""}${abre ? `<svg class="kx-seta" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron"/></svg>`
        : (acao && !String(acao).startsWith("pg:") ? `<svg class="kx-card" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-abre-card"/></svg>` : "")}</div>
    <div class="vl${sinal||""}">${fmt ? esc(fmt(valor||0)) : BRL.format(valor||0)}</div>
    ${extra?`<div class="plus">${extra}</div>`:""}
    ${sub?`<div class="sb">${sub}</div>`:""}
    ${pe||""}
    ${abre ? `<div class="kx"><div class="kx-in">${abre.linhas.map(([n,v])=>
      `<div class="kx-l${v ? "" : " zero"}"><span>${esc(n)}</span><b>${esc(NUM2.format(v))}</b></div>`).join("")}</div></div>` : ""}
  </${tag}>`;
}

/** Liga os cartões clicáveis: ou abrem um formulário, ou trocam de página. */
function ligarAcoes(box){
  $(box).querySelectorAll("[data-acao]").forEach(b=>b.onclick=()=>{
    const [tipo,valor] = b.dataset.acao.split(":");
    if(tipo==="pg") return irPara(valor);
    if(tipo==="holerite") return abrirHolerite();
    if(tipo==="abrir"){                       // Itaú e PicPay abrem e fecham juntos, no próprio card
      const sim = !KPI_ABERTO.has("bancos");
      sim ? KPI_ABERTO.add("bancos") : KPI_ABERTO.delete("bancos");
      $(box).querySelectorAll(".kpi.abre").forEach(k=>{ k.classList.toggle("aberto", sim); k.setAttribute("aria-expanded", String(sim)); });
      return;
    }
    grupoAberto = grupoAberto===valor ? null : valor;
    renderEditor();
    if(EM_CARD.has(valor)) return;   // card flutuante: nada para rolar
    const alvo = $(grupoDe(valor).alvo || "m-editor");
    if(grupoAberto && alvo) alvo.scrollIntoView({block:"nearest", behavior:"smooth"});
  });
}

