/* ═══════════ eventos ═══════════ */

// menu lateral
document.querySelectorAll("#menu button").forEach(b=>b.onclick=()=>irPara(b.dataset.pg));
// visualização dos gráficos do Dashboard: linha, barras ou tabela
try{
  const v = JSON.parse(localStorage.getItem("ritmo:vis")||"{}");
  // cada gráfico tem as suas opções; escolha antiga que não existe mais volta ao padrão
  const OPCOES_VIS = { semanas:["barras","faixas","pizza"], dia:["linha","barras","tabela","calendario"] };
  if(v.semanas==="linha") v.semanas = "faixas";      // a linha virou faixas
  ["semanas","dia"].forEach(k=>{ if(OPCOES_VIS[k].includes(v[k])) S.vis[k]=v[k]; });
}catch(e){}
document.querySelectorAll(".vis-sel button").forEach(b=>b.onclick=()=>{
  const alvo = b.closest(".vis-sel").dataset.vis;
  S.vis[alvo] = b.dataset.v;
  try{ localStorage.setItem("ritmo:vis", JSON.stringify(S.vis)); }catch(e){}
  if(alvo==="semanas") protegido("semanas", renderSemanas);
  else protegido("dia", renderDia);
});
// Ritmo do mês: alarga o gráfico no celular para rolar para o lado
$("dia-expandir").addEventListener("click", ()=>{
  S.diaExpandido = !S.diaExpandido;
  S.diaRolarHoje = S.diaExpandido;
  protegido("dia", renderDia);
});
// barra inferior do celular: mesmos destinos, mesma função
document.querySelectorAll("#tabbar button[data-pg], #tb-menu button").forEach(b=>b.onclick=()=>irPara(b.dataset.pg));

/* "Mais" da barra do celular: as abas que não cabem, numa lista por cima */
/* o menu do "+" fica sempre montado (para animar ao abrir e ao fechar);
   o do "Mais" usa hidden */
const menuAberto = m => m.id==="tb-lancar-menu" ? m.classList.contains("aberto") : !m.hidden;
function abrirMenu(m, sim){
  if(m.id==="tb-lancar-menu"){ m.classList.toggle("aberto", sim); m.setAttribute("aria-hidden", String(!sim)); }
  else m.hidden = !sim;
}
function fecharMenuMais(){
  [["tb-menu","tb-mais"],["tb-lancar-menu","tb-lancar"]].forEach(([mid,bid])=>{
    const m = $(mid), b = $(bid);
    if(!m || !menuAberto(m)) return;
    abrirMenu(m, false);
    if(b) b.setAttribute("aria-expanded", "false");
  });
  document.body.classList.remove("lancar-aberto");
}
[["tb-mais","tb-menu"],["tb-lancar","tb-lancar-menu"]].forEach(([bid,mid])=>{
  $(bid).onclick = e => {
    e.stopPropagation();
    const m = $(mid), aberto = menuAberto(m);
    fecharMenuMais();
    if(aberto) return;
    abrirMenu(m, true);
    $(bid).setAttribute("aria-expanded", "true");
    if(bid==="tb-lancar"){
      document.body.classList.add("lancar-aberto");
      // onda de luz a partir do centro do botão
      const onda = $("tb-onda"), r = $(bid).querySelector(".tb-ic").getBoundingClientRect();
      onda.style.left = (r.left + r.width/2) + "px";
      onda.style.top  = (r.top + r.height/2) + "px";
      onda.classList.remove("on"); void onda.offsetWidth; onda.classList.add("on");
      document.documentElement.style.setProperty("--fab-topo", (innerHeight - r.top + 14) + "px");
    }
  };
});
// cada opção do "+" abre o card do grupo direto no formulário
document.querySelectorAll("#tb-lancar-menu [data-lancar]").forEach(b=>b.onclick=()=>{
  fecharMenuMais();
  lancarRapido(b.dataset.lancar);
});
document.addEventListener("click", e=>{ if(!e.target.closest("#tb-menu, #tb-lancar-menu")) fecharMenuMais(); });
document.addEventListener("keydown", e=>{ if(e.key==="Escape") fecharMenuMais(); });
$("rail-toggle").onclick=()=>{
  const min = document.body.classList.toggle("rail-min");
  $("rail-toggle").innerHTML = `<svg class="ic" viewBox="0 0 24 24"><use href="#i-${min?"right":"left"}"/></svg>`;
  $("rail-toggle").title = min ? "Expandir menu" : "Recolher menu";
};
$("burger").onclick=()=>document.body.classList.add("drawer");
$("scrim").onclick=()=>document.body.classList.remove("drawer");
document.addEventListener("keydown", e=>{
  if(e.key==="Escape") document.body.classList.remove("drawer");
});

// seletor de paleta
document.querySelectorAll("#temas button").forEach(b=>b.onclick=()=>{
  aplicarTema(b.dataset.tema);
  render();                       // gráficos são hex literal: precisam ser redesenhados
});

// filtros — comportamento idêntico ao de antes, só mudaram de lugar
/* Troca de mês (lista ou setas). Com um card aberto, ele se refaz no mês
   novo: o holerite e a semana (mesma posição) acompanham; os editores já
   se redesenham pelo render. */
function trocarMes(v){
  if(!v || v===S.mesSel) return;
  S.mesSel = v; $("f-month").value = v;
  render(); refazerCard();
}
$("f-month").addEventListener("change", e=>trocarMes(e.target.value));
document.querySelectorAll(".f-mes-seta").forEach(b=>b.onclick = () => {
  const i = S.faturas.indexOf(S.mesSel) + Number(b.dataset.d);
  if(i>=0 && i<S.faturas.length) trocarMes(S.faturas[i]);
});
$("f-pix").addEventListener("change",   e=>{ S.incluirPix=e.target.checked; render(); refazerCard(); });
$("f-role").addEventListener("change",  e=>{ S.soRole=e.target.checked; render(); refazerCard(); });
/* funil: desce e recolhe a grade de filtros; tocar fora recolhe */
function filtrosAbertos(sim){
  const f = $("barra-filtros");
  if(sim && !f.classList.contains("abertos")){
    // atraso de cada chip: a partir do canto do funil (direita, em cima)
    f.querySelectorAll(".chips .chip").forEach((c,i)=>{
      const r = Math.floor(i/3), col = i%3;
      c.style.setProperty("--atraso", (0.05 + (2-col)*0.05 + r*0.06).toFixed(2)+"s");
    });
    const fu = $("f-funil");
    fu.classList.remove("mola"); void fu.offsetWidth; fu.classList.add("mola");
  }
  f.classList.toggle("abertos", sim);
  $("f-funil").setAttribute("aria-expanded", String(sim));
}
$("f-funil").onclick = e => { e.stopPropagation(); filtrosAbertos(!$("barra-filtros").classList.contains("abertos")); };
document.addEventListener("click", e=>{
  if(!e.target.closest("#barra-filtros, .dl-lista, .dl-veu")) filtrosAbertos(false);
});
document.addEventListener("keydown", e=>{ if(e.key==="Escape") filtrosAbertos(false); });

/* chips que não cabem rolam de lado; com mouse, a roda vertical vira
   rolagem horizontal enquanto houver para onde ir (nas pontas, a página rola) */
(function(){
  const c = document.querySelector("#barra-filtros .chips");
  if(!c) return;
  c.addEventListener("wheel", e=>{
    if(Math.abs(e.deltaY) <= Math.abs(e.deltaX) || c.scrollWidth <= c.clientWidth) return;
    const max = c.scrollWidth - c.clientWidth;
    if((e.deltaY < 0 && c.scrollLeft <= 0) || (e.deltaY > 0 && c.scrollLeft >= max - 1)) return;
    c.scrollLeft += e.deltaY;
    e.preventDefault();
  }, {passive:false});
})();
document.querySelectorAll("#barra-filtros input[data-inc]").forEach(inp=>
  inp.addEventListener("change", e=>{ S.inc[e.target.dataset.inc]=e.target.checked; render(); refazerCard(); }));

/* Ao rolar, a barra de filtros fica fixa no topo (celular e desktop).
   No celular ela vira uma linha só que rola de lado (mês + chips); no
   desktop ocupa a largura da área de conteúdo, sem cobrir o menu.

   Ela vira position:fixed e sai do fluxo; no lugar dela entra um
   espaço vazio com a altura exata que ela ocupava. A página nunca muda
   de tamanho, então a rolagem não é corrigida pelo navegador e a barra
   não fica soltando e grudando (era o que fazia piscar). A decisão olha
   só a posição do marcador, com uma folga de alguns px para não oscilar
   no limite. */
(function(){
  const sent = $("filtros-sentinela"), barra = $("barra-filtros"), lugar = $("filtros-lugar");
  if(!sent || !barra || !lugar) return;
  const celular = matchMedia("(max-width:760px)");
  let presa = false, agendado = false;
  const soltar = () => {
    if(!presa) return;
    presa = false;
    barra.classList.remove("presa");
    barra.style.left = barra.style.width = barra.style.paddingLeft = barra.style.paddingRight = "";
    lugar.style.height = "0px";
  };
  const prender = () => {
    if(presa) return;
    const cs = getComputedStyle(barra);
    // altura que a barra ocupava no fluxo, com a margem de baixo
    const ocupava = barra.offsetHeight + (parseFloat(cs.marginTop)||0) + (parseFloat(cs.marginBottom)||0);
    // todas as medidas antes de mexer em qualquer coisa: uma leitura no
    // meio das escritas força o layout com a página "meio trocada" e o
    // navegador compensa a rolagem (era o pulo no desktop)
    const r = celular.matches ? null : document.querySelector(".main").getBoundingClientRect();
    const ri = celular.matches ? null : document.querySelector(".main-in").getBoundingClientRect();
    if(r){
      // desktop: a faixa cobre a área principal (o menu lateral fica livre)
      // e o conteúdo dela fica alinhado com a coluna central da página,
      // que tem largura máxima — em tela larga ela fica no meio
      barra.style.left = r.left + "px";
      barra.style.width = r.width + "px";
      barra.style.paddingLeft  = Math.max(16, ri.left - r.left) + "px";
      barra.style.paddingRight = Math.max(16, r.right - ri.right) + "px";
    }
    barra.classList.add("presa");
    lugar.style.height = ocupava + "px";
    presa = true;
  };
  const avaliar = () => {
    agendado = false;
    if(barra.classList.contains("hidden")){ soltar(); return; }
    const y = sent.getBoundingClientRect().top;   // o marcador fica sempre no fluxo
    if(!presa && y < -4) prender();
    else if(presa && y > 4) soltar();
  };
  const pedir = () => { if(!agendado){ agendado = true; requestAnimationFrame(avaliar); } };
  addEventListener("scroll", pedir, {passive:true});
  addEventListener("resize", ()=>{ soltar(); pedir(); });
  celular.addEventListener && celular.addEventListener("change", ()=>{ soltar(); pedir(); });
  const trilho = document.querySelector(".rail");
  if(trilho) trilho.addEventListener("transitionend", ()=>{ if(presa){ soltar(); pedir(); } });
  pedir();
})();
$("ev-parcelas").addEventListener("change", e=>{ S.evParcelas=e.target.checked; render(); });
$("ev-fixos").addEventListener("change",    e=>{ S.evFixos=e.target.checked; render(); });
$("ev-caju").addEventListener("change",     e=>{ S.evCaju=e.target.checked; render(); });
$("ev-de").addEventListener("change",  e=>{ S.evDe=e.target.value;  render(); });
$("ev-ate").addEventListener("change", e=>{ S.evAte=e.target.value; render(); });
$("en-de").addEventListener("change",  e=>{ S.evDe=e.target.value;  render(); });
$("en-ate").addEventListener("change", e=>{ S.evAte=e.target.value; render(); });
$("m-busca").addEventListener("input",  e=>{ S.busca=e.target.value; renderExtrato(); });
// filtros da lista: recolhidos atrás do botão ao lado da busca
$("lf-botao").addEventListener("click", ()=>{
  const painel = $("lista-filtros"), abrir = painel.hidden;
  painel.hidden = !abrir;
  $("lf-botao").setAttribute("aria-expanded", String(abrir));
});
$("m-salvar-roles").onclick = () => salvarRoles();

// atalhos para os formulários
document.querySelectorAll("[data-ir]").forEach(b=>b.onclick=()=>irPara(b.dataset.ir));
[["en-editar","entradas"]].forEach(([botao,quadro])=>{
  $(botao).onclick=()=>{ S.editando = S.editando===quadro ? null : quadro; render(); };
});

[["fx-editar","fixos"],["dv-editar","devem"],["dd-editar","devo"],["cj-editar","caju2"]].forEach(([botao,grupo])=>{
  $(botao).onclick=()=>{
    grupoAberto = grupoAberto===grupo ? null : grupo;
    renderEditor();
    if(!EM_CARD.has(grupo)){
      const alvo = $(grupoDe(grupo).alvo);
      if(grupoAberto && alvo) alvo.scrollIntoView({block:"nearest", behavior:"smooth"});
    }
  };
});

$("btn-load").onclick=()=>carregar();

