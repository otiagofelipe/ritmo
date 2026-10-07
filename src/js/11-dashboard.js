/* ═══════════ Dashboard ═══════════ */

/**
 * As contas do mês selecionado, com os filtros da barra. O Dashboard e a
 * faixa de resumo do celular leem daqui, então os números sempre batem.
 */
function contasDoMes(){
  const linhas = doMes();
  const cartoes = linhas.filter(x=>!x.contaCorrente && x.conta && x.conta.id!=="caju");
  const caju = linhas.filter(x=>x.conta && x.conta.id==="caju");

  const gastoCartoes = soma(cartoes);
  const gastoCaju = soma(caju);
  const teto = tetoCaju(S.mesSel);
  const sobraCaju = Math.max(teto - gastoCaju, 0);
  const pendentes = (S.soRole || !S.inc.fixos || !S.inc.picpay) ? [] : fixasPendentes();
  const previstoFixas = pendentes.reduce((a,f)=>a+(Number(f.valor)||0),0);

  const devo  = somaGrupo("devo");
  const devem = somaGrupo("devem");

  /* Faturas: tudo do Itaú + tudo do PicPay + os fixos que ainda vão
     ser cobrados (os já cobrados estão dentro das faturas). */
  const faturas = gastoCartoes + (S.soRole ? 0 : previstoFixas);

  /* Mesma conta do "Disponível" da tabela Fatura a fatura (Mês a mês):
     salário − (faturas com fixos + eu devo − me devem) + sobra do Caju.
     O gasto no Caju não desconta aqui: ele sai do vale, não do salário. */
  const posso = salarioDe(S.mesSel) - (faturas + devo - devem) + sobraCaju;

  return { linhas, cartoes, caju, gastoCartoes, gastoCaju, teto, sobraCaju,
           previstoFixas, devo, devem, faturas, posso };
}

function renderResumo(){
  const { linhas, cartoes, gastoCartoes, gastoCaju, sobraCaju,
          previstoFixas, devo, devem, faturas, posso } = contasDoMes();

  /* O número em evidência é o mês inteiro, com fixos:
     Faturas + eu devo − me devem + o gasto no Caju. */
  const total = faturas + devo - devem + gastoCaju;

  /* Total limpo: o que eu realmente gastei neste mês. Itaú + PicPay
     sem parcelas e sem cobranças de conta fixa, + eu devo sem parcelas
     e sem fixos (Pix e Enel), − me devem, + o gasto no Caju. Fixos ainda
     a cobrar não entram. */
  const idsFixas = idsCobrancasFixas(S.mesSel);
  const limpo = x => !x.parcela && !x.fixa && !idsFixas.has(x.id);
  const cartoesLimpo = soma(cartoes.filter(x=>(x.conta.id==="itau" || x.conta.id==="picpay") && limpo(x)));
  const devoLimpo = itensContados("devo")
    .filter(i=>!i.parcela && !ehDevoFixo(i))
    .reduce((a,i)=>a+(Number(i.valor)||0),0);
  const totalLimpo = cartoesLimpo + devoLimpo - devem + gastoCaju;

  // o mesmo total, contando só o que foi marcado como rolê
  const totalRole = soma(linhas.filter(x=>!x.contaCorrente && ehRole(x)));

  $("m-titulo").innerHTML = rotuloFaturaHTML(S.mesSel);
  // "aberta"/"fechada" sai da fatura, não do calendário
  $("m-progresso").innerHTML = "· " + (S.mesSel===S.mesAberto ? `dia ${TODAY.getDate()}`
    : (S.mesSel>S.mesAberto ? "previsto" : "fechada"))
    + " " + dica("Itaú + PicPay (com fixos) + Eu devo - Me devem + Gasto no Caju");
  contarTotal(total);
  // as três leituras do total, em linhas curtas dentro do card
  const linha = (v, nome, formula) =>
    `<div class="tl"><span>${esc(nome)} ${dica(formula)}</span><b>${BRL.format(v)}</b></div>`;
  $("m-split").innerHTML =
      linha(faturas,     "Faturas", "Itaú + PicPay (com fixos)")
    + linha(totalLimpo,  "Total limpo",
        "Total sem parcelas, fixos e Me devem")
    + linha(totalRole,   "Total rolê",
        "Total destacado apenas com gastos de rolê");

  const cardConta = c => {
    const desta = linhas.filter(x=>x.conta && x.conta.id===c.id && !x.contaCorrente);
    const v = soma(desta);
    const teto = c.temTeto ? tetoCaju(S.mesSel) : 0;
    const prev = c.id==="picpay" ? previstoFixas : 0;   // os fixos debitam no PicPay
    const editavel = GRUPOS.find(g=>g.grupoPlanilha===c.id);
    /* Itaú e PicPay se abrem no próprio card. O total se divide em
       parcelas, fixos (cobranças de conta fixa já na fatura + os que
       ainda vão cair) e o resto, as compras avulsas do mês. */
    let abre = null;
    if(c.id==="itau" || c.id==="picpay"){
      const parc = soma(desta.filter(x=>x.parcela));
      const fixo = soma(desta.filter(x=>!x.parcela && (x.fixa || idsFixas.has(x.id)))) + prev;
      abre = { id:c.id, linhas:[["Avulsos", v + prev - parc - fixo], ["Fixos", fixo], ["Parcelas", parc]] };
    }
    return kpi({
      nome:c.titulo, selo:marca(c), valor:v+prev, tom: TOM_CARD[c.id], abre,
      sub: teto
        ? (S.soRole ? "gasto no rolê" : `${BRL.format(Math.max(teto-v,0))} disponível`)
        : (desta.length ? `${desta.length} lançamento${desta.length>1?"s":""}` : "sem lançamentos"),
      acao: editavel ? "grupo:"+editavel.id : (abre ? "abrir:"+c.id : null)
    });
  };

  const cardGrupo = g => {
    const itens = itensContados(g.id);
    const pago = itens.filter(i=>i.pago).reduce((a,i)=>a+(Number(i.valor)||0),0);
    const parc = itens.filter(i=>i.parcela);
    return kpi({
      nome:g.titulo, cor:g.cor, valor:somaGrupo(g.id), tom: TOM_CARD[g.id],
      sub: itens.length ? `${BRL.format(pago)} pago${parc.length?` · ${parc.length} parcelada${parc.length>1?"s":""}`:""}`
                        : "nada anotado",
      acao: "grupo:"+g.id      // abre o card, como o do Caju
    });
  };

  /* Visão progressiva do que de fato foi gasto no mês: sem as
     parcelas de compras antigas e sem as contas fixas. É recorte de
     leitura — o total geral acima continua com tudo. */
  const proprio = gastoProprio(linhas);
  const soCartoes = proprio.filter(x=>!x.contaCorrente && x.conta && x.conta.id!=="caju");
  const soCaju    = proprio.filter(x=>x.conta && x.conta.id==="caju");
  const vItau     = soma(soCartoes.filter(x=>x.conta.id==="itau"));
  const vPicpay   = soma(soCartoes.filter(x=>x.conta.id==="picpay"));
  /* Cards em grupos: saldo ao lado do total; cartões (as contas sem
     teto); benefícios (vales, com a barra do teto); outros (Eu devo e
     Me devem). */
  $("m-saldo").innerHTML = kpi({nome:"saldo do mês", valor:posso, destaque:true, acao:"holerite:mes",
           sinal: posso<0 ? " neg" : "",
           sub: `Salário ${BRL.format(salarioDe(S.mesSel))}`,
           });

  $("m-cartoes").innerHTML = CONTAS.filter(c=>!c.temTeto).map(cardConta).join("");
  $("m-cartoes-tot").textContent = BRL.format(faturas);

  const barra = (gasto, teto) => `<div class="barra" aria-hidden="true"><i style="width:${
    teto>0 ? Math.min(100, gasto/teto*100).toFixed(1) : 0}%"></i></div>`;
  const cardBeneficio = b => {
    const conta = b.conta ? CONTAS.find(c=>c.id===b.conta) : null;
    const gasto = conta ? gastoCaju : 0;
    const teto  = conta ? tetoCaju(S.mesSel) : 0;
    const editavel = conta ? GRUPOS.find(g=>g.grupoPlanilha===conta.id) : null;
    return kpi({
      nome:b.titulo, selo:marca({id:b.logo, titulo:b.fornecedor, cor:b.cor}),
      apos:`<span class="forn">${esc(b.fornecedor)}</span>`,
      valor:gasto, tom: conta ? TOM_CARD[conta.id] : b.cor,
      sub: (S.soRole && conta) ? "gasto no rolê" : `${BRL.format(Math.max(teto-gasto,0))} disponível`,
      pe: barra(gasto, teto),
      acao: editavel ? "grupo:"+editavel.id : null
    });
  };
  $("m-beneficios").innerHTML = BENEFICIOS.map(cardBeneficio).join("");

  $("m-outros").innerHTML = ["devo","devem"]
    .map(id=>GRUPOS.find(g=>g.id===id && !g.semCard)).filter(Boolean).map(cardGrupo).join("");

  ["m-saldo","m-cartoes","m-beneficios","m-outros"].forEach(ligarAcoes);

  // os números do herói agora vivem todos em m-split, um sob o outro
  $("m-escada").innerHTML = "";
}

/**
 * Ritmo do mês: quanto saiu em cada dia da competência.
 *
 * O eixo é o mês-calendário, esticado quando algum lançamento cai
 * fora dele — na fatura aberta as compras pós-fechamento fazem isso.
 * Dia sem gasto aparece como zero, que é o ponto do gráfico.
 */
function renderDia(){
  const linhas = linhasDosGraficos();
  const [ano,mes] = S.mesSel.split("-").map(Number);

  let ini = new Date(ano, mes-1, 1), fim = new Date(ano, mes, 0);
  for(const l of linhas){
    if(l.data < ini) ini = new Date(l.data);
    if(l.data > fim) fim = new Date(l.data);
  }

  const dias = [], cursor = new Date(ini);
  while(cursor <= fim && dias.length < 95){
    dias.push(new Date(cursor));
    cursor.setDate(cursor.getDate()+1);
  }

  const chave = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  const agg = new Map();
  for(const l of linhas) agg.set(chave(l.data), (agg.get(chave(l.data))||0) + l.valor);

  const valores = dias.map(d=>agg.get(chave(d))||0);
  const hoje = dias.findIndex(d=>chave(d)===chave(TODAY));
  // segundas-feiras: risco fino separando uma semana da outra
  const divisorias = dias.map((d,i)=>d.getDay()===1?i:-1).filter(i=>i>0);

  // cada trecho entre segundas ganha o rótulo da semana no topo
  const semanas = semanasDoMes(S.mesSel);
  const faixas = [];
  for(const w of semanas){
    const i0 = dias.findIndex(d=>chave(d)>=chave(w.ini));
    let i1 = -1;
    dias.forEach((d,i)=>{ if(chave(d)<=chave(w.fim)) i1 = i; });
    if(i0>=0 && i1>i0) faixas.push({i0, i1, rot:w.rot,
      curto:`${p2(w.ini.getDate())}/${p2(w.ini.getMonth()+1)}`});
  }

  $("m-dia-nota").textContent = "";
  marcarVis("dia");

  /* Destaque: o dia de maior gasto de cada semana (segunda a domingo).
     Semana sem gasto não tem destaque. */
  const inicioSemana = d => { const s=new Date(d); s.setDate(s.getDate()-((s.getDay()+6)%7)); return chave(s); };
  const maiorDaSemana = new Map();          // início da semana → índice
  dias.forEach((d,i)=>{
    if(valores[i]<=0) return;
    const k = inicioSemana(d), j = maiorDaSemana.get(k);
    if(j===undefined || valores[i]>valores[j]) maiorDaSemana.set(k, i);
  });
  const picos = [...maiorDaSemana.values()];
  // quinta, sexta e sábado: bolinha maior; os outros dias, bolinha normal
  const fimDeSemana = d => d.getDay()>=4 && d.getDay()<=6;
  const marca = d => `<span class="${fimDeSemana(d)?"mk-grande":"mk-cheia"}" aria-hidden="true"></span>`;

  const vis = S.vis.dia;

  /* Expandido (só no celular, em linha e barras): cada dia ganha 64px e
     a caixa rola para o lado, com todos os dias no eixo e o valor de
     cada dia escrito. O eixo Y fica parado na esquerda (ver eixoFixo) e
     o balão do toque abre por cima, como no gráfico normal. */
  const PX_DIA = 64;
  const podeExpandir = window.innerWidth <= 760 && (vis==="linha" || vis==="barras");
  const expandido = podeExpandir && S.diaExpandido;
  const btExp = $("dia-expandir"), rolo = $("m-dia-rolo");
  btExp.hidden = !podeExpandir;
  btExp.setAttribute("aria-pressed", String(expandido));
  btExp.title = expandido ? "Voltar ao tamanho da tela" : "Alargar o gráfico";
  btExp.setAttribute("aria-label", expandido ? "Voltar o gráfico ao tamanho da tela" : "Alargar o gráfico e rolar para o lado");
  rolo.classList.toggle("largo", expandido);
  $("m-dia").style.width = expandido ? (dias.length*PX_DIA)+"px" : "";
  const caixa = $("m-dia-caixa");
  caixa.querySelectorAll(":scope > .dia-eixo, :scope > .chart-tip").forEach(e=>e.remove());
  // rolar fecha o balão: ele não acompanha o ponto
  rolo.onscroll = expandido ? () => caixa.querySelectorAll(":scope > .chart-tip").forEach(t=>{ t.style.opacity="0"; }) : null;

  /* Total do período: logo depois do título, separado por um fio, igual
     em todas as visões. Se o número não couber, vira "7,4k"; se nem
     assim, some (o detalhe fica no title). */
  const totalDias = valores.reduce((a,v)=>a+v,0);
  const comGasto = valores.filter(v=>v>0).length;
  const elTot = $("m-dia-total"), elTotV = $("m-dia-total-v");
  elTot.style.visibility = "";
  elTotV.textContent = NUM2.format(totalDias);
  elTot.title = `Total ${RS2(totalDias)} · ${comGasto} ${comGasto===1?"dia":"dias"} com gasto`;
  if(elTotV.scrollWidth > elTotV.clientWidth) elTotV.textContent = RSk(totalDias).replace(/^R\$\s*/, "");
  if(elTotV.scrollWidth > elTotV.clientWidth) elTot.style.visibility = "hidden";

  /* Tabela: no máximo a altura que a linha e as barras ocupam; o resto
     rola dentro dela. Mesma conta de altura do grafico(). */
  const ALTURA_DIA = 200;
  const altGrafico = window.innerWidth <= 760 ? Math.round(ALTURA_DIA*1.3) : ALTURA_DIA;

  if(vis==="tabela"){
    /* Dias com gasto sempre entram; dia zerado só entra se já passou
       (antes de hoje). Do mais recente para o mais antigo, agrupados
       por semana com o subtotal no cabeçalho do grupo. */
    const hojeK = chave(TODAY);
    const grupos = [];                        // do mais antigo ao mais novo
    dias.forEach((d,i)=>{
      if(valores[i]<=0 && chave(d)>=hojeK) return;
      const k = inicioSemana(d);
      let gr = grupos[grupos.length-1];
      if(!gr || gr.k!==k){
        const ini = new Date(d); ini.setDate(ini.getDate()-((ini.getDay()+6)%7));
        const fimS = new Date(ini); fimS.setDate(fimS.getDate()+6);
        gr = { k, rot:`${p2(ini.getDate())}/${p2(ini.getMonth()+1)} - ${p2(fimS.getDate())}/${p2(fimS.getMonth()+1)}`,
               soma:0, linhas:[] };
        grupos.push(gr);
      }
      gr.soma += valores[i];
      const maior = picos.includes(i);
      const cls = [maior?"pico":"", valores[i]<=0?"zero":""].filter(Boolean).join(" ");
      gr.linhas.push(`<tr${i===hoje?' aria-current="true"':""}${cls?` class="${cls}"`:""}>
        <td><span class="dt">${p2(d.getDate())}/${p2(d.getMonth()+1)}</span>${marca(d)}<span class="ds">${esc(DIA_SEM[d.getDay()])}</span></td>
        <td class="n">${esc(RS2(valores[i]))}${maior?' <span class="mk-pico" title="maior dia da semana">▲</span>':""}</td></tr>`);
    });
    const linhasT = [];
    grupos.reverse().forEach(gr=>{
      linhasT.push(`<tr class="semana"><td>${esc(gr.rot)}</td><td class="n">${esc(RS2(gr.soma))}</td></tr>`,
                   ...gr.linhas.reverse());
    });
    tabelaVis("m-dia", ["Data","Gasto"], linhasT);
    const tw = $("m-dia").querySelector(".tab-wrap");
    if(tw) tw.style.maxHeight = altGrafico+"px";
    return;
  }

  grafico("m-dia", {
    titulo:"gasto por dia",
    estilo: vis==="barras" ? "barras" : undefined,
    labels: dias.map(d=>`${p2(d.getDate())}/${p2(d.getMonth()+1)}`),
    labelsTip: dias.map(d=>`${p2(d.getDate())}/${p2(d.getMonth()+1)} ${DIA_SEM[d.getDay()]}`),
    series: [{nome:"gasto do dia", cor:CORES.acento, valores, area:vis!=="barras",
              formas: dias.map(d=>fimDeSemana(d)?"grande":null)}],
    destaque: hoje>=0 ? hoje : undefined,
    divisorias,
    // eixo X: só a segunda-feira de cada semana; se ela não está no
    // gráfico (semana que começou no mês anterior), fica sem rótulo
    // expandido: sem escolha por fora, o eixo mostra todos os dias que couberem
    eixoIndices: expandido ? undefined : dias.map((d,i)=>d.getDay()===1 ? i : -1).filter(i=>i>=0),
    pontos: true,             // um ponto por dia, mesmo com o mês cheio
    // expandido: valor de todo dia com gasto
    rotulos:"picos",
    picosIndices: expandido ? valores.map((v,i)=>v>0 ? i : -1).filter(i=>i>=0) : picos,
    altura: ALTURA_DIA,
    vazio: "Nenhum gasto nesta fatura."
  });
  if(expandido) eixoFixo($("m-dia"), $("m-dia-caixa"));
  // ao expandir, a rolagem começa em hoje (ou no último dia)
  if(expandido && S.diaRolarHoje){
    S.diaRolarHoje = false;
    const alvo = hoje>=0 ? hoje : dias.length-1;
    rolo.scrollLeft = Math.max(0, (alvo+0.5)*PX_DIA - rolo.clientWidth/2);
  }
}

/**
 * Eixo Y parado enquanto o gráfico rola para o lado: copia os rótulos
 * do eixo (text.gy) para um SVG por cima da ponta esquerda da caixa,
 * nas mesmas coordenadas — o gráfico é desenhado na escala 1:1.
 */
function eixoFixo(box, caixa){
  const svg = box.querySelector("svg");
  if(!svg) return;
  const rot = [...svg.querySelectorAll("text.gy")];
  if(!rot.length) return;
  // até o fim do texto do eixo: os pontos e rótulos do 1º dia ficam à vista
  const larg = Math.ceil(Math.max(...rot.map(t=>Number(t.getAttribute("x"))))) + 4;
  const alt = svg.viewBox.baseVal.height;
  const fixo = document.createElement("div");
  fixo.className = "dia-eixo";
  fixo.setAttribute("aria-hidden", "true");
  fixo.style.width = larg+"px";
  fixo.innerHTML = `<svg viewBox="0 0 ${larg} ${alt}" width="${larg}" height="${alt}">${rot.map(t=>t.outerHTML).join("")}</svg>`;
  caixa.appendChild(fixo);
}

/* Rótulos de uma semana para os gráficos do celular. */
const semanaPartes = (w, i, agora) => {
  const [ini, fim] = String(w.rot).split(" - ");
  const fimD = new Date(w.fim.getFullYear(), w.fim.getMonth(), w.fim.getDate(), 23, 59);
  const estado = i===agora ? "agora" : (fimD < TODAY ? "fechada" : "ainda vem");
  return { ini, fim, estado };
};

/**
 * Gastos por semana em colunas, no celular. Sem eixo de valores: cada
 * coluna traz o valor em cima e a semana embaixo. Target e média ficam
 * ao fundo, bem apagados. A semana de agora tem a coluna igual às
 * outras; o que a marca é a data em pílula azul com "agora" embaixo.
 * Tocar numa coluna abre o card com as compras da semana.
 */
function colunasSemanas(box, semanas, valores, agora, media, alt){
  const cel = window.innerWidth <= 760;
  // a legenda embaixo ocupa ~26px da altura combinada
  const L = Math.max(260, box.clientWidth || 340), H = alt ? Math.max(120, alt - 14) : (cel ? 158 : 216);
  const topo = 18, base = H - 38;
  // o target fica perto do topo: sobra pouco espaço vazio acima dele
  const max = Math.max(TARGET_SEMANA * 1.12, ...valores) * 1.06;
  const y = v => base - (Math.max(v,0)/max) * (base - topo);
  const n = semanas.length, larg = L / n, bw = Math.min(46, larg * .56);
  let g = "";
  /* ao fundo: target e média, apagados. A máscara recorta as linhas onde
     há coluna, para elas passarem por trás e não por cima das barras. */
  const furos = semanas.map((w,i)=>{ const cx = larg*i + larg/2, hh = Math.max(base - y(valores[i]), 2);
    return `<rect x="${(cx-bw/2-2).toFixed(1)}" y="${(base-hh-2).toFixed(1)}" width="${(bw+4).toFixed(1)}" height="${(hh+2).toFixed(1)}" rx="6" fill="#000"/>`; }).join("");
  g += `<defs><mask id="cs-atras" maskUnits="userSpaceOnUse" x="0" y="0" width="${L}" height="${H}">
      <rect x="0" y="0" width="${L}" height="${H}" fill="#fff"/>${furos}</mask></defs>
    <g mask="url(#cs-atras)">
      <line class="cs-alvo" x1="0" x2="${L}" y1="${y(TARGET_SEMANA).toFixed(1)}" y2="${y(TARGET_SEMANA).toFixed(1)}"/>
      ${media > 0 ? `<line class="cs-media" x1="0" x2="${L}" y1="${y(media).toFixed(1)}" y2="${y(media).toFixed(1)}"/>` : ""}</g>`;
  let rotulos = "";
  semanas.forEach((w,i)=>{
    const cx = larg*i + larg/2, v = valores[i], hh = Math.max(base - y(v), 2);
    const { ini, fim, estado } = semanaPartes(w, i, agora);
    g += `<g class="cs-col" data-sem="${i}">
      <rect class="cs-hit" x="${(larg*i).toFixed(1)}" y="0" width="${larg.toFixed(1)}" height="${H}"/>
      <rect class="cs-bar" x="${(cx-bw/2).toFixed(1)}" y="${(base-hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" rx="5" fill="${CORES.acento}"/>`;
    // a semana de agora: a data inteira (início e fim) contornada
    if(i===agora)
      g += `<rect class="cs-agora" x="${(cx-25).toFixed(1)}" y="${base+5}" width="50" height="32" rx="9"><title>semana de agora</title></rect>`;
    g += `<text class="cs-x" x="${cx.toFixed(1)}" y="${base+18}" text-anchor="middle">${esc(ini)}</text>
      <text class="cs-x2" x="${cx.toFixed(1)}" y="${base+31}" text-anchor="middle">${esc(fim)}</text></g>`;
    // valores por último, por cima das linhas
    if(v > 0) rotulos += `<text class="cs-val" x="${cx.toFixed(1)}" y="${(base-hh-7).toFixed(1)}" text-anchor="middle">${esc(RS2(v))}</text>`;
  });
  box.innerHTML = `<svg class="cs" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" role="img" aria-label="Gasto por semana">${g}${rotulos}</svg>
    <div class="cs-leg"><span><i class="alvo"></i>target ${esc(RS(TARGET_SEMANA))}</span>${media>0?`<span><i class="media"></i>média ${esc(RS(media))}</span>`:""}</div>`;
  box.querySelectorAll(".cs-col").forEach(el=>el.addEventListener("click", ()=>cardSemana(+el.dataset.sem, semanas)));
}


/**
 * Gastos por semana em faixas (2ª visão): no topo o mês numa faixa só,
 * dividida pelas semanas, com a % de cada uma dentro; embaixo uma linha
 * por semana com a barra até o target (risco tracejado), o valor e
 * quanto passou do target. Tocar numa semana abre o card de compras.
 */
function faixasSemanas(box, semanas, valores, agora, media){
  const tot = valores.reduce((a,v)=>a+Math.max(0,v), 0);
  const escala = Math.max(TARGET_SEMANA * 4/3, ...valores) * 1.05;
  const pAlvo = (TARGET_SEMANA / escala * 100).toFixed(1);
  const cor = i => COR_FATIA[i % COR_FATIA.length];   // as cores da pizza
  const datas = w => String(w.rot).split(" - ");
  const pct = v => tot > 0 ? Math.round(Math.max(0,v) / tot * 100) : 0;
  const pilha = semanas.map((w,i)=>{ const v = valores[i]; if(v <= 0) return "";
      const p = pct(v);
      return `<button type="button" class="fx-seg" data-sem="${i}" style="flex:${v};background:${cor(i)}" title="${esc(w.rot)} · ${p}% do mês">${p >= 8 ? `<span>${p}%</span>` : ""}</button>`; }).join("")
    || `<i class="fx-seg vazio"></i>`;
  box.innerHTML = `<div class="fx-sem" style="--alvo:${pAlvo}%">
    <div class="fx-pilha">${pilha}</div>
    ${semanas.map((w,i)=>{ const v = valores[i], [ini, fim] = datas(w), dif = v - TARGET_SEMANA;
      // diferença para o target: só o valor; vermelho passou, verde ficou abaixo
      const nota = v <= 0 ? "—" : esc(RS2(Math.abs(dif)));
      return `<button type="button" class="fx-l${i===agora?" agora":""}${v>0 ? (dif>0?" passou":" abaixo") : ""}" data-sem="${i}">
        <span class="fx-d"><i class="fx-pt" style="background:${cor(i)}"></i><span class="fx-dt">${esc(ini)} – ${esc(fim)}</span></span>
        <span class="fx-tr"><i style="width:${Math.min(100, Math.max(v,0)/escala*100).toFixed(1)}%"></i></span>
        <span class="fx-v">${esc(RS2(v))}<small>${nota}</small></span></button>`; }).join("")}
    ${(()=>{ /* total do mês contra o target do mês (R$ 600 × semanas), no mesmo formato das semanas */
      const alvoMes = TARGET_SEMANA * semanas.length, difMes = tot - alvoMes;
      const escMes = Math.max(alvoMes * 4/3, tot) * 1.05;
      return `<div class="fx-l fx-total${tot>0 ? (difMes>0?" passou":" abaixo") : ""}" style="--alvo:${(alvoMes/escMes*100).toFixed(1)}%">
        <span class="fx-d"><span class="fx-dt">Total<small>média ${esc(RS(media))}</small></span></span>
        <span class="fx-tr"><i style="width:${Math.min(100, tot/escMes*100).toFixed(1)}%"></i></span>
        <span class="fx-v">${esc(RS2(tot))}<small>${tot>0 ? esc(RS2(Math.abs(difMes))) : "—"}</small></span></div>`; })()}</div>`;
  box.querySelectorAll("[data-sem]").forEach(el=>el.addEventListener("click", ()=>cardSemana(+el.dataset.sem, semanas)));
}

/**
 * Gastos por semana. O cálculo é o mesmo de sempre — a semana vem
 * pronta da planilha e o eixo cobre a competência inteira de segunda
 * a domingo, para as semanas que ainda vão acontecer aparecerem
 * zeradas. Só a apresentação mudou de barra para linha.
 */
function renderSemanas(){
  // mesmos lançamentos do Ritmo do mês: seguem os botões do topo
  const linhas = linhasDosGraficos();
  const semanas = semanasDoMes(S.mesSel);
  if(!semanas.length){ $("m-semanas").innerHTML=`<div class="blank">Sem semanas nesta competência.</div>`; return; }

  const valores = semanas.map(()=>0);
  for(const l of linhas) valores[semanaDe(l, semanas)] += l.valor;

  /* A última semana que começa do dia 25 em diante é praticamente do
     mês seguinte: se ainda está zerada, sai do gráfico. Com gasto,
     continua aparecendo. Só o gráfico muda — a semana segue existindo
     no filtro da lista e na conta de cada lançamento. */
  const ult = semanas.length-1;
  if(ult>0 && semanas[ult].ini.getDate()>=25 && Math.abs(valores[ult])<0.005){
    semanas.pop(); valores.pop();
  }

  const emCurso = w => TODAY>=w.ini && TODAY<=new Date(w.fim.getFullYear(),w.fim.getMonth(),w.fim.getDate(),23,59);
  const agora = semanas.findIndex(emCurso);

  /* Média só das semanas que tiveram gasto: as semanas ainda por
     acontecer valem zero e puxariam a média para baixo sem motivo. */
  const comGasto = valores.filter(v=>v>0);
  const media = comGasto.length ? comGasto.reduce((a,v)=>a+v,0)/comGasto.length : 0;
  // a média já está desenhada no gráfico; repetir no título é ruído
  $("m-semana-nota").textContent = "";

  if(S.vis.semanas==="tabela") S.vis.semanas = "barras";   // opção retirada
  // "faixas" ocupou o lugar da linha
  if(S.vis.semanas==="linha") S.vis.semanas = "faixas";
  const vis = S.vis.semanas;
  marcarVis("semanas");
  /* Em tabela e em pizza, a caixa fica com a altura que o gráfico
     ocuparia — o herói não cresce ao trocar de modo. */
  /* As três visões ocupam a mesma altura: a das faixas. Desenha as faixas,
     mede e, se a escolha for outra, desenha a outra nessa altura. */
  const boxS = $("m-semanas");
  boxS.classList.remove("modo-fixo");
  boxS.style.height = "";
  faixasSemanas(boxS, semanas, valores, agora, media);
  if(vis==="faixas") return;
  const alt = boxS.offsetHeight >= 80 ? Math.ceil(boxS.offsetHeight) : 0;   // 0: página escondida
  if(alt) boxS.style.height = alt+"px";
  if(vis==="pizza") pizzaSemanas(boxS, semanas, valores, agora, alt || 220, media);
  else colunasSemanas(boxS, semanas, valores, agora, media, alt);
}

/**
 * Barra de filtros da lista. Reconstruída só quando a competência
 * muda — assim arrastar o slider ou digitar na busca não recria os
 * controles debaixo do dedo.
 */
function renderFiltrosLista(){
  const box = $("lista-filtros");
  if(box.dataset.mes === S.mesSel) return;
  box.dataset.mes = S.mesSel;
  S.fCartao = ""; S.fSemana = ""; S.faixa = null;

  // parcelas entram: o slider precisa alcançar o valor delas também
  const linhas = doMes();
  /* Valores distintos da coluna card da CONSOLIDADO inteira, não só
     do mês: filtrar por um cartão sem gasto no mês é uma resposta
     legítima ("não gastei nada ali"). */
  const cartoes = [...new Set(S.linhas.filter(l=>!l.pendente)
    .map(l=>String(l.cartao||"").trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const temSemCartao = linhas.some(l=>!String(l.cartao||"").trim());
  const semanas = semanasDoMes(S.mesSel);
  const teto = Math.max(Math.ceil(Math.max(...linhas.map(l=>l.valor), 0)/50)*50, 50);

  box.innerHTML = `
    <label class="ff"><span class="tagx">cartão</span>
      <select id="f-cartao">
        <option value="">Todos</option>
        ${cartoes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("")}
        ${temSemCartao?`<option value="__vazio">Sem cartão</option>`:""}
      </select></label>
    <label class="ff"><span class="tagx">semana</span>
      <select id="f-semana">
        <option value="">Todas</option>
        ${semanas.map((w,i)=>`<option value="${i}">${esc(w.rot)}</option>`).join("")}
      </select></label>
    <div class="lf-pe">
      <div class="ff faixa"><span class="tagx">valor <span class="faixa-val" id="f-faixa-val">R$ 0 — ${esc(RS(teto))}</span></span>
        <div class="slider" id="f-slider">
          <span class="trilho"></span><span class="ativo" id="f-ativo"></span>
          <input type="range" id="f-min" min="0" max="${teto}" step="10" value="0" aria-label="Valor mínimo">
          <input type="range" id="f-max" min="0" max="${teto}" step="10" value="${teto}" aria-label="Valor máximo">
        </div></div>
      <button class="btn-limpar" id="f-limpar">limpar</button>
    </div>`;

  const iMin=$("f-min"), iMax=$("f-max"), ativo=$("f-ativo"), rot=$("f-faixa-val");
  const pintar = () => {
    let a=Number(iMin.value), b=Number(iMax.value);
    if(a>b){ [a,b]=[b,a]; }
    ativo.style.left  = (a/teto*100)+"%";
    ativo.style.width = ((b-a)/teto*100)+"%";
    rot.textContent = `${RS(a)} — ${RS(b)}`;
    S.faixa = (a<=0 && b>=teto) ? null : [a,b];
  };
  [iMin,iMax].forEach(el=>el.addEventListener("input", ()=>{ pintar(); renderExtrato(); }));
  pintar();

  $("f-cartao").addEventListener("change", e=>{ S.fCartao=e.target.value; renderExtrato(); });
  $("f-semana").addEventListener("change", e=>{ S.fSemana=e.target.value; renderExtrato(); });
  $("f-limpar").onclick = () => {
    S.fCartao=""; S.fSemana=""; S.busca="";
    $("f-cartao").value=""; $("f-semana").value=""; $("m-busca").value="";
    iMin.value=0; iMax.value=teto; pintar();
    renderExtrato();
  };
}

/**
 * Selo do botão de filtros da lista: quantos filtros estão ligados.
 * A busca fica à vista ao lado do botão, então não entra na conta.
 */
function contarFiltrosLista(){
  const n = (S.fCartao ? 1 : 0) + (S.fSemana !== "" && S.fSemana != null ? 1 : 0) + (S.faixa ? 1 : 0);
  const selo = $("lf-n");
  if(!selo) return;
  selo.hidden = !n;
  selo.textContent = n ? String(n) : "";
  $("lf-botao").classList.toggle("ativo", n > 0);
}

function renderExtrato(){
  contarFiltrosLista();
  /* Parcelas entram na lista, datadas pela transaction_date — o dia
     da compra original. Uma parcela 3/10 de um notebook comprado em
     junho aparece sob junho, com o selo dizendo qual parcela é. */
  let linhas = doMes();

  // cartão
  if(S.fCartao==="__vazio") linhas = linhas.filter(l=>!String(l.cartao||"").trim());
  else if(S.fCartao)        linhas = linhas.filter(l=>String(l.cartao||"").trim()===S.fCartao);

  // semana — mesma definição do gráfico semanal
  if(S.fSemana!==""){
    const semanas = semanasDoMes(S.mesSel);
    const alvo = Number(S.fSemana);
    if(semanas.length) linhas = linhas.filter(l=>semanaDe(l, semanas)===alvo);
  }

  // faixa de valor
  if(S.faixa) linhas = linhas.filter(l=>l.valor>=S.faixa[0] && l.valor<=S.faixa[1]);

  const termo = norm(S.busca).trim();
  if(termo) linhas = linhas.filter(l=>[
      l.desc, l.categoria, l.metodo, l.cartao, l.operacao, l.hora,
      l.valor.toFixed(2), l.valor.toFixed(2).replace(".",","),
      `${p2(l.data.getDate())}/${p2(l.data.getMonth()+1)}`,
      `${l.data.getFullYear()}-${p2(l.data.getMonth()+1)}-${p2(l.data.getDate())}`
    ].some(c=>norm(c).includes(termo)));

  $("m-conta").textContent =
    `${linhas.length} lançamento${linhas.length===1?"":"s"} encontrado${linhas.length===1?"":"s"} · ${RS2(soma(linhas))}`;

  if(!linhas.length){
    $("m-lista").innerHTML = `<div class="blank">${
      termo ? "Nada encontrado para essa busca."
            : (S.soRole ? "Nenhum gasto marcado como rolê." : "Nenhum gasto com esses filtros.")}</div>`;
    return;
  }

  const porDia = new Map();
  /* Caju no topo de cada dia: o vale não traz hora, e sem ela a
     ordenação por horário jogava essas compras para o fim, como se
     tivessem acontecido à meia-noite. */
  const ehCaju = l => !!(l.conta && l.conta.id === "caju");
  for(const l of linhas.sort((a,b)=> b.data-a.data
        || (ehCaju(b)?1:0) - (ehCaju(a)?1:0)
        || String(b.hora).localeCompare(String(a.hora))
        || b.valor-a.valor)){
    const k = `${l.data.getFullYear()}-${p2(l.data.getMonth()+1)}-${p2(l.data.getDate())}`;
    if(!porDia.has(k)) porDia.set(k, {d:l.data, itens:[]});
    porDia.get(k).itens.push(l);
  }

  $("m-lista").innerHTML = [...porDia.values()].map(({d,itens})=>
    `<div class="daymark">${p2(d.getDate())}/${p2(d.getMonth()+1)}${
       String(d.getFullYear())!==String(S.mesSel).slice(0,4) ? "/"+String(d.getFullYear()).slice(2) : ""}
       <span class="dsem">${DIA_SEM[d.getDay()]}</span> · ${BRL0.format(Math.round(soma(itens)))}</div>`
    + itens.map(l=>{
        const futuro = l.data>TODAY;
        const cor = l.conta ? l.conta.cor : CORES.suave;
        /* Valor na mesma linha do nome, com uma guia pontilhada no
           meio: em tela larga ele ficava do outro lado do mundo, e
           alinhar à direita continua sendo o que deixa a coluna de
           números legível. */
        /* Valor na mesma linha do nome, com uma guia pontilhada no
           meio, e o resto embaixo. A lista tem largura de leitura e se
           centraliza, senão em tela larga o valor fica longe do nome. */
        return `<div class="tx${futuro?" futura":""}${l.role?" role":""}${l.parcela?" parcela":""}">
          <input type="checkbox" class="chk-role" data-id="${esc(l.id)}" data-chave="${esc(chaveRole(l))}"
            ${ehRole(l)?" checked":""} title="${l.role?"Veio marcado do Databricks":"Marcar como rolê"}">
          ${marca(l.conta)}
          <div class="tx-main">
            <div class="tx-topo">
              <span class="tx-desc">${esc(l.desc)}</span>
              <span class="tx-guia"></span>
              <span class="tx-val">${BRL.format(l.valor)}</span>
            </div>
            <div class="tx-meta">
              ${l.categoria?`<span class="pill" style="background:${cor}22;color:${cor}">${esc(l.categoria)}</span>`:""}
              <span>${esc(l.metodo)}</span>
              ${l.hora?`<span>${esc(l.hora)}</span>`:""}
              ${l.parcela?`<span class="pill parc" title="Compra feita nesta data, parcelada">parcela ${l.parcela.i}/${l.parcela.n}</span>`:""}
              ${futuro?`<span class="pill">a vencer</span>`:""}
              ${l.pendente?`<span class="pill" title="Gravado no Databricks; entra na lista normal no próximo carregamento">recém-lançado</span>`:""}
            </div>
          </div>
        </div>`;
      }).join("")
  ).join("");

  $("m-lista").querySelectorAll(".chk-role").forEach(cb=>cb.onchange=()=>{
    const id = cb.dataset.chave;
    // desmarcar precisa registrar exclusão, senão o is_entertainment
    // da planilha remarcaria a linha no próximo carregamento
    if(cb.checked){ S.roles.add(id); S.rolesFora.delete(id); }
    else          { S.roles.delete(id); S.rolesFora.add(id); }
    // compras iguais (mesma descrição, valor e dia) andam juntas
    $("m-lista").querySelectorAll(".chk-role").forEach(o=>{
      if(o.dataset.chave===id){ o.checked = cb.checked; o.closest(".tx").classList.toggle("role", cb.checked); }
    });

    /* O botão conta o que mudou nesta sessão, não o total marcado.
       Desmarcar de volta ao estado original tira a linha da conta. */
    if(S.rolesMudados.has(id)){
      if(S.rolesMudados.get(id) === cb.checked) S.rolesMudados.delete(id);
    } else {
      S.rolesMudados.set(id, !cb.checked);
    }
    S.rolesSujo = S.rolesMudados.size > 0;
    atualizarBotaoRoles();
  });
  atualizarBotaoRoles();
}

function atualizarBotaoRoles(){
  const b=$("m-salvar-roles");
  if(!b) return;
  b.classList.toggle("hidden", !S.rolesSujo);
  const n = S.rolesMudados.size;
  b.textContent = S.salvando ? "Salvando…"
    : `Salvar ${n} ${n===1?"alteração":"alterações"}`;
}

/**
 * Grava as marcações de rolê alteradas nesta sessão. Cada uma vira uma
 * linha na bronze.ritmo.tb_entertainment com descrição, valor e dia (a
 * chave que não muda) e o id da transação; vale a marcação mais recente.
 */
async function salvarRoles(){
  const linhas = [];
  for(const chave of S.rolesMudados.keys()){
    const l = S.linhas.find(x => chaveRole(x) === chave && !x.pendente);
    if(!l) continue;
    const marcado = S.roles.has(chave) && !S.rolesFora.has(chave);
    S.linhas.forEach(x=>{ if(chaveRole(x)===chave) x.role = marcado; });
    linhas.push({ id_transaction: l.id || null, nm_merchant: l.desc,
                  vl_amount: l.valor, dt_transaction: diaISO(l.data), fl_entertainment: marcado });
  }
  // otimista: o botão some na hora; aviso só se falhar
  S.rolesMudados.clear(); S.rolesSujo = false; S.salvando = false;
  atualizarBotaoRoles();
  if(!linhas.length) return;
  try{
    await api("/salvar", { op: "entertainment", linhas });
  }catch(e){
    banner("err", `Não consegui gravar os rolês no Databricks: ${esc(e.message)}`);
  }
}

/** Parcelas do cartão que caem nesta fatura. */
function renderParcelas(){
  // ordem da compra original, da mais recente para a mais antiga
  const linhas = S.linhas.filter(x=>daCompetencia(x, S.mesSel) && x.parcela)
                         .sort((a,b)=>b.data-a.data);
  $("m-parc-conta").textContent = linhas.length ? `${linhas.length} em aberto` : "";
  if(!linhas.length){
    $("m-parcelas").innerHTML = `<div class="blank">Nenhuma parcela nesta fatura.</div>`;
    return;
  }
  // o selo já diz o banco; no lugar do nome dele vai a data da compra
  const dia = d => `${p2(d.getDate())}/${p2(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}`;
  $("m-parcelas").innerHTML = `<div class="bl-rolo">` + linhas.map(l=>
    `<div class="lrow">${marca(l.conta, true)}
     <div class="nm">${esc(l.desc)}
       <div class="sub">parcela ${l.parcela.i} de ${l.parcela.n} · ${esc(dia(l.data))}</div></div>
     <div class="vl">${BRL.format(l.valor)}</div></div>`).join("") + `</div>`
    + `<div class="ltotal"><span class="nm">total</span>
       <span class="vl">${BRL.format(soma(linhas))}</span></div>`;
}

/** Bloco resumido de contas fixas no Dashboard. */
function renderFixasResumo(){
  const vigentes = fixasVigentes();
  if(!vigentes.length){
    $("m-fixas").innerHTML = `<div class="blank">Nenhuma conta fixa vigente nesta competência.</div>`;
    return;
  }
  const { html, meuTotal, deOutros, aCobrar } = listaFixas(vigentes);
  // totais nas mesmas caixas dos Registros (Me devem / Eu devo) e da página de fixos
  $("m-fixas").innerHTML = `<div class="bl-rolo">${html}</div>`
    + caixasTotais([["meu total", meuTotal], ...(deOutros ? [["de terceiros", deOutros]] : []), ["a cobrar", aCobrar, "aberto"]]);
}

/** Linhas de conta fixa + os três totais, compartilhado entre Dashboard e página. */
/**
 * Ordem do ciclo da fatura: a compra depois do dia 26 já cai na fatura
 * seguinte, então o mês começa no 27 — 27, 28 … 31, 1, 2 … 26. Sem dia
 * vai para o fim.
 */
const ordemDia = dia => { const n = Number(dia); return !n ? 99 : (n >= 27 ? n - 27 : n + 5); };

/** Cartõezinhos das contas fixas (aba Gastos fixos). */
function cartoesFixas(lista){
  return `<div class="cd-lista">${lista.slice().sort((a,b)=>ordemDia(a.data)-ordemDia(b.data)).map(f=>{
    const c = cobrancaDaFixa(f), st = statusFixa(f, c);
    const valor = c ? Math.abs(c.valor) : (Number(f.valor)||0);
    const dif = c && Math.abs(valor-(Number(f.valor)||0))>0.005;
    const det = [f.data ? `todo dia ${f.data}` : "",
      c ? `${ehFixaPix(f)?"pago":"cobrado"} ${p2(c.data.getDate())}/${p2(c.data.getMonth()+1)}` : (ehFixaPix(f) ? "via Pix" : "aguardando"),
      vigenciaTexto(f)].filter(Boolean).join(" · ");
    return cartao({ cls: `${st==="pago"?"pago":st}${f.terceiro?" de-outro":""}`, titulo: rotuloFixa(f),
      tags: (f.terceiro?`<span class="tag" title="De terceiro: não é meu, só passa no meu cartão">3º</span>`:"") + (ehFixaPix(f)?`<span class="tag">Pix</span>`:""),
      valor, sub: dif ? `<div class="dif">previsto ${esc(BRL.format(f.valor))}</div>` : "",
      det: esc(det), dir: selo(st) });
  }).join("")}</div>`;
}

function listaFixas(lista, comVigencia){
  let aCobrar = 0, meuTotal = 0, deOutros = 0;
  const html = lista.slice()
    .sort((a,b)=>ordemDia(a.data)-ordemDia(b.data))
    .map(f=>{
      const c = cobrancaDaFixa(f);
      // em cima o que foi cobrado; o previsto desce quando os dois diferem
      const valor = c ? Math.abs(c.valor) : (Number(f.valor)||0);
      if(!c && !ehFixaPix(f)) aCobrar += Number(f.valor)||0;
      (f.terceiro ? deOutros += valor : meuTotal += valor);
      const dif = c && Math.abs(valor-(Number(f.valor)||0))>0.005;
      return `<div class="lrow${f.terceiro?" de-outro":""}">
        <div class="nm">${esc(rotuloFixa(f))}${f.terceiro?`<span class="tag" title="De terceiro: não é meu, só passa no meu cartão">3º</span>`:""}${
          ehFixaPix(f)?`<span class="tag">Pix</span>`:""}
          <div class="sub">${f.data?`todo dia ${esc(String(f.data))} · `:""}${
            c ? `${ehFixaPix(f)?"pago":"cobrado"} ${p2(c.data.getDate())}/${p2(c.data.getMonth()+1)}`
              : (ehFixaPix(f) ? "via Pix · entra em Eu devo" : "aguardando cobrança")}${
            comVigencia ? ` · ${vigenciaTexto(f)}` : ""}</div>
        </div>
        <div class="vl">${BRL.format(valor)}${
          dif?`<div class="dif">previsto ${BRL.format(f.valor)}</div>`:""}</div>
        ${selo(statusFixa(f, c))}
      </div>`;
    }).join("");
  return { html, meuTotal, deOutros, aCobrar };
}

/**
 * Status de uma conta fixa no mês. Vencido só quando o dia combinado
 * já passou e a cobrança não apareceu — e só faz sentido na fatura
 * aberta; em mês fechado ou futuro isso não é atraso.
 */
function statusFixa(f, cobranca){
  if(cobranca) return "pago";
  const dia = Number(f.data);
  if(S.mesSel===S.mesAberto && dia && TODAY.getDate() > dia) return "vencido";
  return "pendente";
}

const ROTULO_STATUS = { pago:"Pago", pendente:"Pendente", vencido:"Vencido" };
const selo = st => `<span class="badge ${st}">${ROTULO_STATUS[st]||st}</span>`;

const vigenciaTexto = f => {
  const i = compDe(f.inicio), t = compDe(f.fim);
  if(!i && !t) return "sem prazo";
  if(i && t)   return `${mesCurto(i)} → ${mesCurto(t)}`;
  if(t)        return `até ${mesCurto(t)}`;
  return `desde ${mesCurto(i)}`;
};

