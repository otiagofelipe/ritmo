/* ═══════════ Mês a mês ═══════════ */

/**
 * De/Até: listas com todos os meses dos anos que têm fatura, agrupadas
 * por ano (é o que o seletor de mês e ano lê). No celular o mês aparece
 * só como "Jan", "Fev", para as duas caberem na mesma linha. Mês a mês
 * e Entradas usam o mesmo recorte (S.evDe/S.evAte).
 */
function preencherPeriodo(idDe, idAte){
  const estreito = window.innerWidth <= 760;
  const anos = [...new Set(S.faturas.concat([S.evDe, S.evAte]).map(m=>String(m).slice(0,4)))]
    .filter(a=>/^\d{4}$/.test(a)).sort();
  const nomeMes = m => {
    const [a,mm] = m.split("-").map(Number);
    const n = MES[mm-1].charAt(0).toUpperCase()+MES[mm-1].slice(1);
    return estreito ? n : `${n}/${String(a).slice(2)}`;
  };
  const opcoes = anos.map(a=>`<optgroup label="${a}">${
    MES.map((_,i)=>{ const v=`${a}-${p2(i+1)}`; return `<option value="${v}">${esc(nomeMes(v))}</option>`; }).join("")
  }</optgroup>`).join("");
  [idDe, idAte].forEach(id=>{
    const sel = $(id);
    if(sel && sel.dataset.op !== opcoes){ sel.innerHTML = opcoes; sel.dataset.op = opcoes; }
  });
  if($(idDe).value  !== S.evDe)  $(idDe).value  = S.evDe;
  if($(idAte).value !== S.evAte) $(idAte).value = S.evAte;
  return estreito;
}

function pgEvolucao(){
  /* Recorte de competências. Nasce no ano da fatura aberta, de
     janeiro a dezembro, e inclui as faturas futuras — o que ainda vai
     cair também é informação. */
  if(!S.evDe || !S.evAte){
    const ano = String(S.mesAberto || "").slice(0,4) || String(TODAY.getFullYear());
    S.evDe  = ano+"-01";
    S.evAte = ano+"-12";
  }
  const estreitoEv = preencherPeriodo("ev-de","ev-ate");

  const dentro = m => m>=S.evDe && m<=S.evAte;
  const eixo = S.faturas.filter(dentro);
  if(!eixo.length){
    $("ev-meses").innerHTML = `<div class="blank">Nenhuma fatura entre
      ${esc(mesCurto(S.evDe))} e ${esc(mesCurto(S.evAte))}.</div>`;
    ["ev-total","ev-futuro"].forEach(id=>
      $(id).innerHTML = `<div class="blank">Sem faturas no período.</div>`);
    return;
  }

  /* Os três checkboxes recortam o gráfico: parcelas, contas fixas e
     Caju. Todos entram por padrão, então ele nasce igual ao gasto
     real da fatura. */
  /* O is_fixed da CONSOLIDADO vem vazio, então desligar "gastos
     fixos" não tirava nada. O que identifica a cobrança de uma conta
     fixa é o mesmo casamento por nome usado no resto do app. */
  const cacheFixos = new Map();
  const ehFixo = (x, m) => {
    if(x.fixa) return true;
    if(!cacheFixos.has(m)) cacheFixos.set(m, idsCobrancasFixas(m));
    return cacheFixos.get(m).has(x.id);
  };

  const recorte = m => doComp(m).filter(x=>!x.contaCorrente
    && (S.evParcelas || !x.parcela)
    && (S.evFixos    || !ehFixo(x, m))
    && (S.evCaju     || !(x.conta && x.conta.id==="caju")));

  const porConta = (m, id) => soma(recorte(m).filter(x=>x.conta && x.conta.id===id));
  // Total é a soma das linhas desenhadas, para fechar com o que se vê
  const totalDe = m => porConta(m,"itau") + porConta(m,"picpay")
                     + (S.evCaju ? porConta(m,"caju") : 0);

  /* Uma barra só, a do total. A quebra por conta mora no tooltip:
     quatro séries sobrepostas disputavam a mesma área e nenhuma
     ficava legível. */
  const series = [
    { nome:"Total Geral", cor:CORES.acento, valores:eixo.map(totalDe) }
  ];
  const detalhes = eixo.map(m=>{
    const d = [
      { nome:"Itaú",   cor:CORES.itau,   valor:porConta(m,"itau") },
      { nome:"PicPay", cor:CORES.picpay, valor:porConta(m,"picpay") }
    ];
    if(S.evCaju) d.push({ nome:"Caju", cor:CORES.caju, valor:porConta(m,"caju") });
    // a entrada já vem como série no tooltip; repetir aqui duplicava
    return d;
  });

  /* Média só das faturas já formadas: as futuras são projeção de
     parcela e puxariam a conta para baixo. */
  const formadas = eixo.filter(m=>m<=S.mesAberto).map(totalDe).filter(v=>v>0);
  const media = formadas.length ? formadas.reduce((a,v)=>a+v,0)/formadas.length : 0;

  grafico("ev-total", {
    semLegenda: true,
    titulo:"gasto por fatura",
    // no celular o eixo mostra só "Jan", "Fev"; o tooltip segue com o ano
    labels: eixo.map(m=> estreitoEv
      ? MES[Number(m.slice(5,7))-1].charAt(0).toUpperCase()+MES[Number(m.slice(5,7))-1].slice(1)
      : mesCurto(m)),
    labelsTip: eixo.map(mesCurto),
    series: series.concat([{
      // linha, não barra: a entrada varia mês a mês e é referência,
      // não mais uma coluna a comparar. O valor aparece só no mês
      // aberto na tela — em todos, viraria uma segunda régua de números
      nome:"Entradas", cor:CORES.ok, linha:true, tracejada:true,
      valores: eixo.map(m=>rendaDe(m).total),
      // alcança as bordas e leva o valor na margem, como a média
      estender:true, rotuloPonta:"Entradas",
      rotuloPontaIndice: eixo.indexOf(S.mesSel)
    }]),
    detalhes,
    estilo:"barras",
    destaque: eixo.indexOf(S.mesSel),
    rotulos:"total",          // só o total leva número; o resto polui
    compacto:true,
    refs: [
      { v: media, rot: "Média: "+RS(media), cor: "var(--text-secondary)" }
    ],
    altura: 245,
    vazio:"Sem faturas para comparar."
  });

  renderFaturaAFatura(eixo);

  const fut = comprometidoFuturo();
  grafico("ev-futuro", {
    titulo:"comprometimento futuro",
    labels: fut.map(([c])=>mesCurto(c)),
    series: [{nome:"parcelas", cor:CORES.aviso, valores:fut.map(([,v])=>v), area:true}],
    rotulos:"todos",
    compacto:true,
    altura: 200,
    vazio:"Nada parcelado para as próximas faturas."
  });
}

function renderFaturaAFatura(eixo){
  /**
   * Uma fatura inteira em números. Reaproveita os mesmos leitores do
   * Dashboard, só que apontados para outra competência — nada aqui
   * recalcula regra de negócio por conta própria.
   */
  const linhaDe = m => {
    const l = doComp(m).filter(x=>!x.contaCorrente);
    const itau   = soma(l.filter(x=>x.conta && x.conta.id==="itau"));
    // os fixos debitam no PicPay: o que ainda não caiu entra previsto
    const previsto = fixasPrevistas(m);
    const picpay = soma(l.filter(x=>x.conta && x.conta.id==="picpay")) + previsto;
    const gastoCaju = soma(l.filter(x=>x.conta && x.conta.id==="caju"));

    const devo  = somaGrupo("devo",  m);
    const devem = somaGrupo("devem", m);
    const pagaram = itensDoMes("devem", m)
      .filter(i=>i.pago).reduce((a,i)=>a+(Number(i.valor)||0),0);

    const cartoes = itau + picpay;
    // mesma convenção do total do Dashboard: eu devo soma, me devem abate
    const total = cartoes + devo - devem;
    const totalGeral = total + gastoCaju;   // tudo que saiu, salário e vale
    const sobra = salarioDe(m) - total;
    const sobraCaju = Math.max(tetoCaju(m) - gastoCaju, 0);   // vale da própria fatura

    return { m, itau, picpay, previsto, cartoes, devo, devem, pagaram,
             total, gastoCaju, totalGeral, sobra, sobraCaju, disponivel: sobra + sobraCaju };
  };

  const linhas = eixo.map(linhaDe);
  // centavo de arredondamento não vira "R$ -0"
  // centavos à mostra: arredondar escondia diferença de conciliação
  const cel = (v, cls, titulo) => Math.abs(v) < 0.005
    ? `<td class="${cls||""}"><span class="zero">—</span></td>`
    : `<td class="${cls||""}${v<0?" neg":""}"${titulo?` title="${esc(titulo)}"`:""}>${esc(RS2(v))}</td>`;

  // cabeçalho com selo: selo e texto alinhados pelo centro
  const selo = id => marca(CONTAS.find(c=>c.id===id), true);
  const cab = (ic, txt) => `<span class="th-ic">${ic}<span>${esc(txt)}</span></span>`;

  /* Sem linha de grupos no cabeçalho: rótulo centralizado sobre
     colunas de conteúdo alinhado à direita nunca casa. Os blocos são
     separados por um filete vertical e os totais, por um fundo. */
  $("ev-meses").innerHTML = linhas.length ? `<table class="tab-fat larga">
    <thead><tr>
      <th>Fatura</th>
      <th class="grupo">${cab(selo("itau"), "Itaú")}</th>
      <th>${cab(selo("picpay"), "PicPay")}</th>
      <th class="soma">Subtotal</th>
      <th class="grupo">Eu devo</th><th>Me devem</th><th>Já pagaram</th>
      <th class="grupo soma" title="Itaú + PicPay + eu devo − me devem">Total</th>
      <th class="grupo" title="Gasto no vale Caju">${cab(selo("caju"), "Gasto")}</th>
      <th class="soma" title="Total + gasto Caju">Total geral</th>
      <th class="grupo" title="Sobra do salário: salário − total">${cab(`<i class="marca sm" style="background:#22C55E26;color:#22C55E" aria-hidden="true">$</i>`, "Sobra")}</th>
      <th title="Sobra do vale: Caju − gasto Caju">${cab(selo("caju"), "Sobra")}</th>
      <th class="soma" title="Sobra + Caju">Disponível</th>
    </tr></thead>
    <tbody>${linhas.map(r=>`
      <tr data-mes="${r.m}" ${r.m===S.mesSel?'aria-current="true"':""}>
        <td class="c-fat"><span class="fat-nm">${rotuloFaturaHTML(r.m)}</span>${
          r.m===S.mesAberto?`<span class="badge neutro">aberta</span>`:""}</td>
        ${cel(r.itau,"grupo")}${cel(r.picpay, "", r.previsto
          ? `fatura ${RS2(r.picpay-r.previsto)} + ${RS2(r.previsto)} de fixos ainda a cair` : "")}
        ${cel(r.cartoes,"soma")}
        ${cel(r.devo,"grupo")}${cel(r.devem)}${cel(r.pagaram)}
        ${cel(r.total,"grupo soma")}
        ${cel(r.gastoCaju,"grupo")}${cel(r.totalGeral,"soma")}
        ${cel(r.sobra,"grupo")}${cel(r.sobraCaju)}
        <td class="soma${r.disponivel<0?" neg":""}"><span class="tot">${esc(RS2(r.disponivel))}</span></td>
      </tr>`).join("")}</tbody></table>`
    : `<div class="blank">Sem faturas.</div>`;

  $("ev-meses").querySelectorAll("[data-mes]").forEach(tr=>tr.onclick=()=>{
    S.mesSel = tr.dataset.mes;
    irPara("dash");
  });
}

/**
 * Tudo que já está comprometido nas próximas faturas: as parcelas que
 * a CONSOLIDADO já conhece mais as do quadro "Eu devo".
 */
function comprometidoFuturo(){
  const mapa = new Map();
  for(const l of S.linhas)
    if(l.parcela && l.competencia > S.mesAberto)
      mapa.set(l.competencia, (mapa.get(l.competencia)||0) + l.valor);
  for(const [c,v] of parcelasFuturas("devo", S.mesAberto))
    mapa.set(c, (mapa.get(c)||0) + v);
  return [...mapa.entries()].sort();
}

