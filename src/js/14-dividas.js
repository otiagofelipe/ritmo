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
  // um cartão por pessoa: o que falta em destaque; embaixo quanto já foi pago
  box.innerHTML = `<div class="cd-lista">${linhas.map(([p,r])=>{ const ok = r.falta<=0.004;
      return cartao({ cls: ok ? "pago" : "pend", titulo:p, valor: ok ? r.pago : r.falta,
        det: esc(ok ? `${id==="devem"?"pagou":"paguei"} tudo` : `${id==="devem"?"pagou":"paguei"} ${RS2(r.pago)} de ${RS2(r.pago+r.falta)}`),
        dir: selo(ok ? "pago" : "pendente") }); }).join("")}</div>`
    + caixasTotais([[id==="devem"?"pagou":"paguei", tp, "pago"], ["falta", tf, "aberto"]]);
}

/* ═══ cartõezinhos: Eu devo, Me devem e Caju (card e aba) ═══
   Cada registro é um cartão com uma faixa na lateral (pendente ou pago),
   valor à direita e, embaixo, as parcelas em bolinhas (cheia = paga,
   acesa = a deste mês) ou o status em palavra. */
function cartaoDivida(id, i, tag="div"){
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
  } else if(i.parcela) pts = `<small class="cd-d">${i.parcela.i}/${i.parcela.n}</small>`;
  return cartao({ tag, cls: i.pago ? "pago" : "pend", titulo, valor: Number(i.valor)||0,
    det: esc(det) + pts, dir: selo(i.pago ? "pago" : "pendente") });
}
function cartaoCaju(l, tag="div"){
  const pend = String(l.id).startsWith("caju-pendente:");
  return cartao({ tag, cls:"caju", titulo: l.desc || "—", valor: Number(l.valor)||0, det: esc(diaBR(l.data)),
    dir: pend ? `<span class="tag" title="Lançado aqui, ainda não chegou na base">a sincronizar</span>` : "" });
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

  $(pre+"-lista").innerHTML = `<div class="cd-lista">${itens.map(i=>cartaoDivida(id, i)).join("")}</div>`
    + caixasTotais([["neste mês", total], ["em aberto", total-pago, "aberto"], ["já pago", pago, "pago"]]);

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

