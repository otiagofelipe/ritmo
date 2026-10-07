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
    const r = por.get(p) || { pago:0, falta:0, semPessoa:true, fixa:false };
    if(String(i.pessoa||"").trim()) r.semPessoa = false;
    if(i.fixaPix) r.fixa = true;
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
  // uma linha por pessoa: quem · pagou / falta pagar · status; no fim o total
  const quem = id==="devem" ? "Quem me deve" : "A quem devo";
  const verbo = id==="devem" ? "Pagou" : "Paguei";
  const par = (pg, ft) => `<span class="rs-pg">${esc(BRL.format(pg))}</span><i>/</i><span class="rs-ft">${esc(BRL.format(ft))}</span>`;
  box.innerHTML = `<div class="rs-tab">
    <div class="rs-cab"><span>${quem}</span><span>${verbo} / falta pagar</span><span>Status</span></div>
    <div class="rs-corpo">${linhas.map(([p,r])=>{ const ok = r.falta<=0.004;
      return `<div class="rs-ln"><span class="rs-q">${r.semPessoa
        ? `<span class="lst-ic" aria-hidden="true">${iconeGasto(p, r.fixa ? "📌" : "🧾")}</span>`
        : `<span class="lst-ic av ${ok ? "pago" : "pend"}" aria-hidden="true">${inicial(p)}</span>`}<b>${esc(p)}</b></span>
        <span class="rs-v">${par(r.pago, r.falta)}</span><span class="rs-st">${statusLinha(ok)}</span></div>`; }).join("")}</div>
    <div class="rs-ln rs-tot"><span class="rs-q"><b>Total</b></span><span class="rs-v">${par(tp, tf)}</span><span class="rs-st"></span></div>
  </div>`;
}

/* ═══ listas em linhas: Eu devo, Me devem e Caju (card e aba) ═══
   Cada registro é uma linha: ícone (a inicial da pessoa, ou o tipo do
   lugar no Caju), nome com o detalhe embaixo e o valor à direita, com o
   status (pago / pendente) logo abaixo dele. Em cima, uma barra; embaixo,
   os totais. Dentro do card flutuante os totais ficam presos no pé. */

/** Valor sem o "R$": a coluna da direita já é toda em reais. */
const valorCurto = v => BRL.format(Number(v)||0).replace("R$", "").replace(/\s+/g, "");
const inicial = t => esc((String(t||"").trim().charAt(0) || "?").toUpperCase());
const statusLinha = pago => selo(pago ? "pago" : "pendente");

/** Molde da linha. `ic`, `sub` e `status` já vêm em HTML. */
function linhaLista({ tag="div", cls="", ic, icCls="", titulo, sub="", valor, status="" }){
  return `<${tag}${tag==="button"?' type="button"':""} class="lst-it${cls?" "+cls:""}">
    <span class="lst-ic${icCls?" "+icCls:""}" aria-hidden="true">${ic}</span>
    <span class="lst-n"><b>${esc(titulo)}</b>${sub?`<small>${sub}</small>`:""}</span>
    <span class="lst-v">${valor == null ? "" : esc(valorCurto(valor))}${status}</span></${tag}>`;
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

/* Me devem / Eu devo em colunas, quase uma tabela: ícone do gasto ·
   pessoa · gasto (com o detalhe embaixo) · valor e status. */
function cabDivida(id){
  // no celular a coluna da pessoa é estreita: o rótulo encurta
  const [longo, curto] = id==="devem" ? ["Quem me deve", "Quem"] : ["A quem devo", "Pra quem"];
  return `<div class="dv-cab" aria-hidden="true"><span></span><span><span class="cab-l">${longo}</span><span class="cab-c">${curto}</span></span>
    <span>Gasto</span><span>Valor</span></div>`;
}
function linhaDivida(id, i, tag="div"){
  const pessoa = String(i.pessoa||"").trim(), desc = String(i.nome||"").trim();
  const gasto = i.fixaPix ? (desc || "Conta fixa") : (desc && desc !== pessoa ? desc : "");
  const det = i.fixaPix ? "conta fixa · Pix"
    : (i.parcela ? `de ${RS2(i.valorTotal||0)}` : (i.indeterminado ? "todo mês" : "única"));
  let pts = "";
  if(i.parcela && i.parcela.n <= 12){
    const pagas = new Set(numerosPagos(i));
    pts = `<span class="cd-pts" title="parcela ${i.parcela.i} de ${i.parcela.n}">${
      Array.from({length:i.parcela.n}, (_,k)=>`<i class="${pagas.has(k+1) ? "ok" : ""}${k+1===i.parcela.i ? " at" : ""}"></i>`).join("")}</span>`;
  } else if(i.parcela) pts = ` · ${i.parcela.i}/${i.parcela.n}`;
  return `<${tag}${tag==="button"?' type="button"':""} class="lst-it dv-ln ${i.pago ? "pago" : "pend"}">
    <span class="lst-ic" aria-hidden="true">${iconeGasto(gasto || pessoa, i.fixaPix ? "📌" : "🧾")}</span>
    <span class="dv-p">${pessoa ? `<b>${esc(pessoa)}</b>` : `<b class="vazio">—</b>`}</span>
    <span class="dv-g"><b${gasto ? ` title="${esc(gasto)}"` : ` class="vazio"`}>${esc(gasto || "—")}</b><small><span>${esc(det)}</span>${pts}</small></span>
    <span class="lst-v">${esc(valorCurto(Number(i.valor)||0))}${statusLinha(i.pago)}</span></${tag}>`;
}

const SEMANA_CURTA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

/* Ícone pelo gasto (a descrição: onde, o quê), nunca pela pessoa. Um
   mapa só para Caju, Gastos fixos, Me devem e Eu devo; cada lista tem o
   seu ícone para o que não reconhece. */
const ICONES_GASTO = [
  [/posto|gasolina|combustivel|shell|ipiranga|petrobras|\bbr\b/, "⛽"],
  [/padaria|panificadora|\bpao\b|confeitaria/, "🥐"],
  [/\bmc\b|mcdonald|burger|\bbk\b|lanche|hamburg/, "🍔"],
  [/pizza/, "🍕"],
  [/sushi|japones|temaki/, "🍣"],
  [/churrasco|churrascaria|carne|acougue/, "🍖"],
  [/cafe|coffee|starbucks|cafeteria/, "☕"],
  [/sorvete|acai|gelato|doce/, "🍨"],
  [/ifood|rappi|delivery|99food/, "🛵"],
  [/mercado|supermerc|carrefour|pao de acucar|extra|assai|atacad|hortifruti|sacolao|feira/, "🛒"],
  [/\bbar\b|boteco|cervej|chopp|balada/, "🍺"],
  [/internet|fibra|vivo|claro|\btim\b|\boi\b|\bnet\b|wifi/, "🌐"],
  [/celular|telefone/, "📱"],
  [/\bluz\b|energia|enel|eletro|cemig|cpfl/, "💡"],
  [/agua|sabesp|saneamento/, "💧"],
  [/\bgas\b|comgas|ultragaz/, "🔥"],
  [/aluguel|condominio|iptu|imovel/, "🏠"],
  [/netflix|prime video|disney|hbo|\bmax\b|globoplay|youtube|streaming|paramount|crunchyroll/, "📺"],
  [/spotify|deezer|musica|apple music/, "🎵"],
  [/academia|smart ?fit|bluefit|gym|crossfit|wellhub|gympass|totalpass/, "🏋️"],
  [/seguro/, "🛡️"],
  [/icloud|google one|dropbox|nuvem|chatgpt|openai|claude|anthropic|adobe|microsoft|office/, "☁️"],
  [/escola|faculdade|curso|ingles|idioma|mensalidade/, "🎓"],
  [/plano de saude|unimed|amil|sulamerica|odonto|consulta|medico|exame/, "🩺"],
  [/farmacia|drogaria|droga ?raia|drogasil|remedio/, "💊"],
  [/pet|racao|veterin/, "🐾"],
  [/ipva|estacionamento|sem parar|veloe|oficina|mecanico|carro/, "🚗"],
  [/uber|\b99\b|taxi|onibus|metro|bilhete/, "🚕"],
  [/viagem|passagem|hotel|airbnb|hospedagem|aereo|latam|gol\b|azul\b|voo/, "✈️"],
  [/show|ingresso|ticket|evento|festival/, "🎟️"],
  [/cinema|filme/, "🎬"],
  [/presente|aniversario|gift/, "🎁"],
  [/roupa|renner|zara|riachuelo|\bc&a\b|shein|tenis|calcado/, "👕"],
  [/notebook|computador|celular novo|iphone|samsung|eletronico|fone|tv\b|monitor/, "💻"],
  [/emprestimo|divida|parcela|pix/, "💸"],
  [/restaurante|almoco|jantar|comida|marmita/, "🍽️"]
];
function iconeGasto(texto, padrao="🧾"){
  const n = semAcento(texto);
  const achou = n && ICONES_GASTO.find(([re]) => re.test(n));
  return achou ? achou[1] : padrao;
}
const iconeCaju = nome => iconeGasto(nome, "🍽️");
const iconeFixa = nome => iconeGasto(nome, "📌");

/** Uma linha do Caju: ícone do lugar, nome com dia da semana e data embaixo, valor à direita. */
function linhaCaju(l){
  const pend = String(l.id).startsWith("caju-pendente:");
  const quando = l.data ? `${SEMANA_CURTA[l.data.getDay()]} ${diaBR(l.data)}` : "—";
  return linhaLista({ ic: iconeCaju(l.desc), icCls: "lugar", titulo: l.desc || "—", valor: Number(l.valor)||0,
    sub: esc(quando) + (pend ? ` · <span class="lst-pend" title="Lançado aqui, ainda não chegou na base">a sincronizar</span>` : "") });
}

/** Barra dos Gastos fixos: quanto do mês já foi cobrado (ou pago por Pix). */
function barraFixas(lista){
  let total = 0, foi = 0;
  for(const f of lista){
    const c = cobrancaDaFixa(f);
    const v = c ? Math.abs(c.valor) : (Number(f.valor)||0);
    total += v; if(c) foi += v;
  }
  if(total <= 0) return "";
  return barraLista({ pct: foi/total*100, cls: "pago", esq: `${Math.round(foi/total*100)}% já cobrado de ${BRL.format(total)}`,
    dir: `${lista.length} conta${lista.length===1?"":"s"}` });
}
/** Uma conta fixa vigente: ícone, apelido com dia e cobrança embaixo, valor e status. */
function linhaFixa(f, { tag="div", comVigencia=false }={}){
  const c = cobrancaDaFixa(f), st = statusFixa(f, c);
  const valor = c ? Math.abs(c.valor) : (Number(f.valor)||0);
  const dif = c && Math.abs(valor-(Number(f.valor)||0))>0.005;
  const det = [f.data ? `todo dia ${f.data}` : "",
    c ? `${ehFixaPix(f)?"pago":"cobrado"} ${p2(c.data.getDate())}/${p2(c.data.getMonth()+1)}` : (ehFixaPix(f) ? "via Pix" : "aguardando"),
    comVigencia ? vigenciaTexto(f) : "", dif ? `previsto ${BRL.format(f.valor)}` : ""].filter(Boolean).join(" · ");
  const tags = (f.terceiro?`<span class="tag" title="De terceiro: não é meu, só passa no meu cartão">3º</span>`:"") + (ehFixaPix(f)?`<span class="tag">Pix</span>`:"");
  return linhaLista({ tag, cls: f.terceiro ? "de-outro" : "", ic: iconeFixa(rotuloFixa(f)), titulo: rotuloFixa(f),
    sub: (tags ? tags : "") + `<span>${esc(det)}</span>`, valor, status: selo(st) })
    .replace('class="lst-it', `data-fixa="${esc(chaveFixa(f))}" class="lst-it`);
}

/** Barra do vale do Caju; o traço de hoje só aparece no mês corrente. */
function barraCaju(mes, gasto, teto){
  if(!(teto > 0)) return "";
  const [a, m] = String(mes).split("-").map(Number);
  const nDias = new Date(a, m, 0).getDate();
  const noMes = TODAY.getFullYear() === a && TODAY.getMonth()+1 === m;
  // a cor é o que ainda tem no vale; o vazio, o que já foi gasto
  const livre = teto - gasto, pct = livre / teto * 100;
  const fim = 1 - TODAY.getDate() / nDias;    // quanto deveria sobrar hoje, gastando por igual
  return barraLista({ pct, cls: "caju" + (livre < 0 ? " estourou" : ""),
    esq: livre < 0 ? `${BRL.format(-livre)} acima do vale de ${BRL.format(teto)}`
                   : `${Math.round(pct)}% disponível do vale de ${BRL.format(teto)}`,
    dir: noMes ? `dia ${TODAY.getDate()}` : "",
    traco: noMes ? fim * 100 : null,
    tracoTit: `Gastando o vale por igual, hoje sobrariam ${BRL.format(teto * fim)}` });
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
    + cabDivida(id)
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

