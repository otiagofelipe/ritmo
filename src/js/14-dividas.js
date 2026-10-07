/* ═══════════ Me devem / Eu devo ═══════════ */

function pgQuadro(id){
  const g = grupoDe(id);
  const pre = id==="devem" ? "dv" : "dd";
  const itens = itensDoMes(id);
  const pago = itens.filter(i=>i.pago).reduce((a,i)=>a+(Number(i.valor)||0),0);
  const total = itens.reduce((a,i)=>a+(Number(i.valor)||0),0);
  const parceladas = itens.filter(i=>i.parcela);
  const semPrazo = itens.filter(i=>i.indeterminado);
  const pessoas = new Set(itens.map(i=>rotuloPessoa(i)).filter(Boolean));
  // quem ainda deve: tem pelo menos um registro pendente
  const devendo = new Set(itens.filter(i=>!i.pago && (Number(i.valor)||0)>0)
    .map(i=>rotuloPessoa(i)).filter(Boolean));

  $(pre+"-kpis").innerHTML =
      kpi({nome: id==="devem" ? "a receber no mês" : "a pagar no mês",
           valor: total, destaque:true,
           sub: S.soRole ? "zerado pelo filtro de rolê"
                         : `${itens.length} registro${itens.length===1?"":"s"} nesta competência`})
    + kpi({nome:"já quitado", cor:CORES.ok, valor:pago, sub:"marcado como pago"})
    + kpi({nome:"em aberto", cor:g.cor, valor:total-pago, sub:"ainda pendente"})
    + (id==="devo"
        ? kpi({nome:"em parcelas", cor:CORES.aviso, valor:parceladas.reduce((a,i)=>a+i.valor,0),
               sub:`${parceladas.length} parcelamento${parceladas.length===1?"":"s"} em curso${
                 semPrazo.length?` · ${semPrazo.length} sem prazo`:""}`})
        : kpi({nome:"pessoas", cor:CORES.suave, valor:devendo.size, fmt:n=>String(n),
               sub:`de ${pessoas.size} na lista`}));

  montarLista(id, pre, itens, total, pago);

  renderResumoPessoas(id, pre, itens);
  if(id==="devo") renderFuturoDevo();
}

/**
 * Resumo por pessoa: soma do que já foi pago e do que falta, e o
 * status — pago quando não falta nada, pendente enquanto faltar.
 */
function renderResumoPessoas(id, pre, itens){
  const box = $(pre+"-resumo");
  if(!box) return;
  const por = new Map();
  for(const i of itens){
    const p = rotuloPessoa(i) || "—";
    const r = por.get(p) || { pago:0, falta:0 };
    const v = Number(i.valor)||0;
    if(i.pago) r.pago += v; else r.falta += v;
    por.set(p, r);
  }
  if(!por.size){
    box.innerHTML = `<div class="blank">${S.soRole ? "O filtro de rolê zera este quadro." : "Ninguém nesta competência."}</div>`;
    return;
  }
  const linhas = [...por.entries()].sort((a,b)=>b[1].falta-a[1].falta || a[0].localeCompare(b[0]));
  const tp = linhas.reduce((a,[,r])=>a+r.pago,0), tf = linhas.reduce((a,[,r])=>a+r.falta,0);
  // uma linha por pessoa: o que falta em destaque; embaixo quanto já foi pago
  const verbo = id==="devem" ? "pagou" : "paguei";
  box.innerHTML = `<div class="lst-lista">${linhas.map(([p,r])=>{ const ok = r.falta<=0.004;
      return linhaLista({ ic: inicial(p), icCls: "av " + (ok ? "pago" : "pend"), titulo:p,
        sub: esc(ok ? `${verbo} tudo` : `${verbo} ${RS2(r.pago)} de ${RS2(r.pago+r.falta)}`),
        valor: ok ? r.pago : r.falta, status: statusLinha(ok) }); }).join("")}</div>`
    + rodapeLista([[verbo, tp, "pago"], ["falta", tf, "aberto"]]);
}

/* ═══ listas em linhas: Eu devo, Me devem e Caju (card e aba) ═══
   Cada registro é uma linha: ícone (a inicial da pessoa, ou o tipo do
   lugar no Caju), nome com o detalhe embaixo e o valor à direita, com o
   status (pago / pendente) logo abaixo dele. Em cima, uma barra; embaixo,
   os totais. Dentro do card flutuante os totais ficam presos no pé. */

/** Valor sem o "R$": a coluna da direita já é toda em reais. */
const valorCurto = v => BRL.format(Number(v)||0).replace("R$", "").replace(/\s+/g, "");
const inicial = t => esc((String(t||"").trim().charAt(0) || "?").toUpperCase());
const statusLinha = pago => `<small class="lst-st ${pago ? "pago" : "pend"}">${pago ? "pago" : "pendente"}</small>`;

/** Molde da linha. `ic`, `sub` e `status` já vêm em HTML. */
function linhaLista({ tag="div", cls="", ic, icCls="", titulo, sub="", valor, status="" }){
  return `<${tag}${tag==="button"?' type="button"':""} class="lst-it${cls?" "+cls:""}">
    <span class="lst-ic${icCls?" "+icCls:""}" aria-hidden="true">${ic}</span>
    <span class="lst-n"><b>${esc(titulo)}</b>${sub?`<small>${sub}</small>`:""}</span>
    <span class="lst-v">${esc(valorCurto(valor))}${status}</span></${tag}>`;
}

/** Barra de cima: quanto já foi (gasto do vale, ou pago), com um traço opcional. */
function barraLista({ pct, cls="", esq="", dir="", traco=null, tracoTit="" }){
  return `<div class="lst-vale ${cls}">
    <div class="lst-barra${pct > 100 ? " estourou" : ""}"><i style="width:${Math.min(100, Math.max(0, pct)).toFixed(1)}%"></i>${
      traco != null ? `<span class="lst-traco" style="left:${traco.toFixed(1)}%" title="${esc(tracoTit)}"></span>` : ""}</div>
    <div class="lst-leg"><span>${esc(esq)}</span>${dir?`<span>${esc(dir)}</span>`:""}</div></div>`;
}

/** Totais de baixo; `mais` põe o botão de lançar à direita. */
function rodapeLista(pares, mais=""){
  return `<div class="lst-rodape">${pares.map(([n,v,cls])=>
    `<div${cls?` class="${cls}"`:""}><small>${esc(n)}</small><b>${esc(BRL.format(v))}</b></div>`).join("")}${mais
    ? `<button type="button" class="lst-mais" title="${esc(mais)}" aria-label="${esc(mais)}"><svg class="ic" viewBox="0 0 24 24"><use href="#i-plus"/></svg></button>` : ""}</div>`;
}

/** Barra do Me devem / Eu devo: quanto do mês já foi pago. */
function barraPago(id, itens){
  const total = itens.reduce((a,i)=>a+(Number(i.valor)||0), 0);
  if(total <= 0) return "";
  const pago = itens.filter(i=>i.pago).reduce((a,i)=>a+(Number(i.valor)||0), 0);
  const pessoas = new Set(itens.filter(i=>!i.fixaPix).map(i=>rotuloPessoa(i)).filter(Boolean)).size;
  return barraLista({ pct: pago/total*100, cls: "pago",
    esq: `${Math.round(pago/total*100)}% pago de ${BRL.format(total)}`,
    dir: pessoas ? `${pessoas} pessoa${pessoas===1?"":"s"}` : "" });
}

function linhaDivida(id, i, tag="div"){
  const pessoa = String(i.pessoa||"").trim(), desc = String(i.nome||"").trim();
  const temDesc = desc && desc !== pessoa;
  // Me devem: "quem deve - descrição"; Eu devo: a pessoa, e a descrição embaixo
  const titulo = i.fixaPix ? (desc || "Conta fixa")
    : id==="devem" ? (pessoa && temDesc ? `${pessoa} - ${desc}` : (pessoa || desc || "sem nome"))
    : (pessoa || desc || "sem nome");
  const det = i.fixaPix ? "conta fixa · Pix"
    : [id==="devo" && temDesc ? desc : "", i.parcela ? `de ${RS2(i.valorTotal||0)}` : (i.indeterminado ? "todo mês" : "única")]
        .filter(Boolean).join(" · ");
  let pts = "";
  if(i.parcela && i.parcela.n <= 12){
    const pagas = new Set(numerosPagos(i));
    pts = `<span class="cd-pts" title="parcela ${i.parcela.i} de ${i.parcela.n}">${
      Array.from({length:i.parcela.n}, (_,k)=>`<i class="${pagas.has(k+1) ? "ok" : ""}${k+1===i.parcela.i ? " at" : ""}"></i>`).join("")}</span>`;
  } else if(i.parcela) pts = ` · ${i.parcela.i}/${i.parcela.n}`;
  return linhaLista({ tag, cls: i.pago ? "pago" : "pend",
    ic: i.fixaPix ? "📌" : inicial(pessoa || desc), icCls: i.fixaPix ? "" : "av " + (i.pago ? "pago" : "pend"),
    titulo, sub: `<span>${esc(det)}</span>${pts}`, valor: Number(i.valor)||0, status: statusLinha(i.pago) });
}

const SEMANA_CURTA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
/** Ícone do lugar pelo nome; o que não reconhece fica com o prato (é vale-refeição). */
const ICONES_CAJU = [
  [/posto|gasolina|combustivel|shell|ipiranga|petrobras|\bbr\b/, "⛽"],
  [/padaria|panificadora|\bpao\b|confeitaria/, "🥐"],
  [/\bmc\b|mcdonald|burger|\bbk\b|lanche|hamburg/, "🍔"],
  [/pizza/, "🍕"],
  [/sushi|japones|temaki/, "🍣"],
  [/cafe|coffee|starbucks|cafeteria/, "☕"],
  [/sorvete|acai|gelato|doce/, "🍨"],
  [/ifood|rappi|delivery|99food/, "🛵"],
  [/mercado|supermerc|carrefour|pao de acucar|extra|assai|atacad|hortifruti|sacolao/, "🛒"],
  [/bar\b|boteco|cervej|chopp/, "🍺"]
];
function iconeCaju(nome){
  const n = semAcento(nome);
  const achou = ICONES_CAJU.find(([re]) => re.test(n));
  return achou ? achou[1] : "🍽️";
}
/** Uma linha do Caju: ícone do lugar, nome com dia da semana e data embaixo, valor à direita. */
function linhaCaju(l){
  const pend = String(l.id).startsWith("caju-pendente:");
  const quando = l.data ? `${SEMANA_CURTA[l.data.getDay()]} ${diaBR(l.data)}` : "—";
  return linhaLista({ ic: iconeCaju(l.desc), icCls: "lugar", titulo: l.desc || "—", valor: Number(l.valor)||0,
    sub: esc(quando) + (pend ? ` · <span class="lst-pend" title="Lançado aqui, ainda não chegou na base">a sincronizar</span>` : "") });
}

/** Barra do vale do Caju; o traço de hoje só aparece no mês corrente. */
function barraCaju(mes, gasto, teto){
  if(!(teto > 0)) return "";
  const [a, m] = String(mes).split("-").map(Number);
  const nDias = new Date(a, m, 0).getDate();
  const noMes = TODAY.getFullYear() === a && TODAY.getMonth()+1 === m;
  const pct = gasto / teto * 100;
  return barraLista({ pct, cls: "caju", esq: `${Math.round(pct)}% do vale de ${BRL.format(teto)}`,
    dir: noMes ? `dia ${TODAY.getDate()}` : "",
    traco: noMes ? TODAY.getDate() / nDias * 100 : null,
    tracoTit: `Gastando o vale por igual, hoje seriam ${BRL.format(teto * TODAY.getDate() / nDias)}` });
}

/** Molde do cartãozinho: título e valor em cima; detalhe e status embaixo. `det` e `dir` já vêm em HTML. */
function cartao({ tag="div", cls="", titulo, tags="", valor, sub="", det="", dir="" }){
  return `<${tag}${tag==="button"?' type="button"':""} class="cd-it ${cls}">
    <span class="cd-t"><b>${esc(titulo)}</b>${tags}</span><span class="cd-v">${esc(BRL.format(valor))}${sub}</span>
    <span class="cd-l2">${det}</span><span class="cd-r2">${dir}</span></${tag}>`;
}
const caixasTotais = pares => `<div class="cd-tot">${pares.map(([n,v,cls])=>
  `<div${cls?` class="${cls}"`:""}><small>${esc(n)}</small><b>${esc(BRL.format(v))}</b></div>`).join("")}</div>`;

/** Quem deve ou a quem se deve; cai no descritivo quando não há pessoa. */
const rotuloPessoa = i => String(i.pessoa||"").trim() || String(i.nome||"").trim();

/** Como a parcela do mês se descreve. */
const textoParcela = i => i.parcela
  ? `${i.parcela.i}/${i.parcela.n}`
  : (i.indeterminado || i.fixaPix ? "todo mês" : "única");

/* ═══ leitura ═══ */

function montarLista(id, pre, itens, total, pago){
  if(!itens.length){
    $(pre+"-lista").innerHTML = `<div class="blank">${S.soRole
      ? "O filtro de rolê zera este quadro."
      : "Nada anotado nesta competência. Use “adicionar / editar”."}</div>`;
    return;
  }

  $(pre+"-lista").innerHTML = barraPago(id, itens)
    + `<div class="lst-lista">${itens.map(i=>linhaDivida(id, i)).join("")}</div>`
    + rodapeLista([["neste mês", total], ["em aberto", total-pago, "aberto"], ["já pago", pago, "pago"]]);

}

/** Parcelas de "Eu devo" que ainda vão cair nas próximas competências. */
function renderFuturoDevo(){
  const fut = parcelasFuturas("devo", S.mesSel);
  grafico("dd-grafico", {
    titulo:"parcelas à frente",
    labels: fut.map(([c])=>mesCurto(c)),
    series: [{nome:"parcelas", cor:CORES.erro, valores:fut.map(([,v])=>v), area:true}],
    altura: 170,
    vazio: "Nenhuma parcela depois desta competência."
  });
  $("dd-futuro").innerHTML = fut.length
    ? fut.map(([c,v])=>`<div class="lrow"><div class="nm">${rotuloFaturaHTML(c)}</div>
        <div class="vl">${BRL.format(v)}</div></div>`).join("")
      + `<div class="ltotal"><span class="nm">total comprometido</span>
         <span class="vl">${BRL.format(fut.reduce((a,[,v])=>a+v,0))}</span></div>`
    : "";
}

