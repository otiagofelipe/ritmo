/* ═══════════ Entradas ═══════════ */

function pgEntradas(){
  const r = rendaDe(S.mesSel);
  const faixas = (S.reg.entradas || []).slice()
    .sort((a,b)=>String(mesDaEntrada(a)).localeCompare(String(mesDaEntrada(b))));

  // só o título em cada cartão; 1ª e 2ª parte viram um "Salário"
  $("en-kpis").innerHTML =
      kpi({nome:"total do mês", valor:r.total, destaque:true})
    + kpi({nome:"Salário", cor:CORES.ok, valor:(Number(r.parte1)||0)+(Number(r.parte2)||0)})
    + kpi({nome:"Caju", selo:marca(CONTAS.find(c=>c.id==="caju"), true), valor:r.caju})
    + kpi({nome:"acréscimos", cor:CORES.suave, valor:r.acrescimos})
    + kpi({nome:"descontos", cor:CORES.erro, valor:r.descontos,
           sinal: r.descontos ? " neg" : ""});

  /* Evolução da entrada. O eixo segue o mesmo recorte do Mês a mês,
     para os dois gráficos falarem do mesmo período. */
  if(!S.evDe || !S.evAte){
    const ano = String(S.mesAberto || "").slice(0,4) || String(TODAY.getFullYear());
    S.evDe = ano+"-01"; S.evAte = ano+"-12";
  }
  preencherPeriodo("en-de","en-ate");
  const eixo = S.faturas.filter(m=>m>=S.evDe && m<=S.evAte);
  const totais = eixo.map(m=>rendaDe(m).total);
  const variou = new Set(totais.map(v=>v.toFixed(2))).size > 1;
  $("en-nota").textContent = eixo.length
    ? (variou ? `${mesCurto(eixo[0])} → ${mesCurto(eixo[eixo.length-1])}`
              : "sem variação no período")
    : "";

  grafico("en-grafico", {
    titulo:"entrada por mês",
    labels: eixo.map(mesCurto),
    series: [
      { nome:"Total",   cor:CORES.ok,     valores:totais, area:true },
      // rótulo abaixo do ponto: acima ele bateria na linha do total
      { nome:"Salário", cor:CORES.acento, valores:eixo.map(m=>salarioDe(m)),
        rotulo:"abaixo" },
      { nome:"Caju",    cor:CORES.caju,   valores:eixo.map(m=>tetoCaju(m)) }
    ],
    destaque: eixo.indexOf(S.mesSel),
    rotulos:"total",
    compacto:true,
    suave:true,               // linhas arredondadas
    altura: 215,
    vazio:"Sem competências no período."
  });

  // a linha destacada é a que está valendo na competência aberta
  const daVez = faixas.filter(f=>mesDaEntrada(f) && mesDaEntrada(f) <= S.mesSel).pop();

  const editando = S.editando === "entradas";
  $("en-editar").textContent = editando ? "concluir edição" : "adicionar / editar";
  editando ? edicaoEntradas(faixas) : listaEntradas(faixas, daVez);
}

/** Bolinha colorida no cabeçalho da tabela, igual à dos cartões. */
const icCab = cor => `<i class="dot-cab" style="background:${cor}"></i>`;

const totalEntrada = e => (Number(e.parte1)||0)+(Number(e.parte2)||0)+(Number(e.caju)||0)
  + (Number(e.acrescimos !== undefined && e.acrescimos !== "" ? e.acrescimos : e.outros)||0)
  - Math.abs(Number(e.descontos)||0);

function listaEntradas(faixas, daVez){
  const cel = v => Math.abs(Number(v)||0) < 0.005
    ? `<td><span class="zero">—</span></td>` : `<td>${esc(RS2(Number(v)))}</td>`;

  $("en-lista").innerHTML = faixas.length ? `<table class="tab-fat larga">
    <thead><tr>
      <th>Mês</th>
      <th class="grupo">${icCab(CORES.ok)}1ª parte</th><th>${icCab(CORES.ok)}2ª parte</th>
      <th>${marca(CONTAS.find(c=>c.id==="caju"), true)} Caju</th><th>${icCab(CORES.suave)}acréscimos</th><th>${icCab(CORES.erro)}descontos</th>
      <th class="soma" title="1ª + 2ª parte + Caju + acréscimos − descontos">Total</th>
    </tr></thead>
    <tbody>${faixas.map(f=>{
      const acr = Number(f.acrescimos || f.outros)||0;
      const des = -Math.abs(Number(f.descontos)||0);
      return `<tr ${f===daVez?'aria-current="true"':""}>
        <td class="c-fat"><span class="fat-nm">${esc(rotuloFatura(mesDaEntrada(f)))}</span>${
          f===daVez?`<span class="badge neutro">vigente</span>`:""}</td>
        ${cel(f.parte1)}${cel(f.parte2)}${cel(f.caju)}${cel(acr)}
        <td${des?' class="neg"':""}>${des?esc(RS2(des)):`<span class="zero">—</span>`}</td>
        <td class="soma"><span class="tot">${esc(RS2(totalEntrada(f)))}</span></td>
      </tr>`;
    }).join("")}</tbody></table>`
    : `<div class="blank">Nenhum mês cadastrado — o app está usando o valor
       padrão do código. Use “adicionar / editar”.</div>`;
}

/**
 * A mesma tabela, com os campos virando caixas — igual aos quadros de
 * Me devem e Eu devo. O total continua calculado, nunca digitado.
 */
function edicaoEntradas(faixas){
  const caixa = $("en-lista");
  caixa.innerHTML = "";

  const linhas = faixas.map(f=>({
    mes: mesDaEntrada(f) || "",
    parte1:Number(f.parte1)||0, parte2:Number(f.parte2)||0, caju:Number(f.caju)||0,
    acrescimos:Number(f.acrescimos || f.outros)||0,
    descontos:-Math.abs(Number(f.descontos)||0)
  }));

  const tabela=document.createElement("table");
  tabela.className="tab-fat larga edicao";
  tabela.innerHTML = `<thead><tr>
      <th>Mês</th>
      <th class="grupo">${icCab(CORES.ok)}1ª parte</th><th>${icCab(CORES.ok)}2ª parte</th>
      <th>${marca(CONTAS.find(c=>c.id==="caju"), true)} Caju</th><th>${icCab(CORES.suave)}acréscimos</th><th>${icCab(CORES.erro)}descontos</th>
      <th class="soma">Total</th><th></th>
    </tr></thead>`;
  const corpo=document.createElement("tbody");
  tabela.appendChild(corpo);
  caixa.appendChild(tabela);

  const vazia = l => !Number(l.parte1) && !Number(l.parte2) && !Number(l.caju)
                  && !Number(l.acrescimos) && !Number(l.descontos);

  const celula = (tr, campo, cls) => {
    const td=document.createElement("td");
    if(cls) td.className=cls;
    td.appendChild(campo);
    tr.appendChild(td);
  };

  function montar(l){
    const tr=document.createElement("tr");

    celula(tr, campoCompetencia(l.mes, v=>{ l.mes=v; garantir(); }, false), "c-fat");

    const tot=document.createElement("span");
    tot.className="tot";
    const pintar = () => { tot.textContent = RS2(totalEntrada(l)); };

    [["parte1","grupo"],["parte2"],["caju"],["acrescimos"],["descontos"]].forEach(([cmp,cls])=>{
      const campo = campoMoeda(Math.abs(l[cmp]||0), v=>{
        // desconto sempre abate, qualquer que seja o sinal digitado
        l[cmp] = cmp==="descontos" ? -Math.abs(v) : v;
        pintar(); garantir();
      });
      if(cmp==="descontos") campo.classList.add("neg");
      celula(tr, campo, cls);
    });

    pintar();
    celula(tr, tot, "soma");

    const rm=document.createElement("button");
    rm.className="rm"; rm.type="button"; rm.textContent="×"; rm.title="Remover este mês";
    rm.onclick=()=>{
      const i=linhas.indexOf(l);
      if(i>=0) linhas.splice(i,1);
      tr.remove(); garantir();
    };
    celula(tr, rm);

    corpo.appendChild(tr);
    l._tr=tr;
  }

  /** Uma linha em branco sempre esperando, já no mês seguinte. */
  function garantir(){
    while(linhas.length>1 && vazia(linhas[linhas.length-1]) && vazia(linhas[linhas.length-2])){
      const fora=linhas.pop();
      if(fora._tr) fora._tr.remove();
    }
    if(!linhas.length || !vazia(linhas[linhas.length-1])){
      const ultimo = linhas[linhas.length-1];
      const nova={ mes: somaMeses(ultimo && ultimo.mes || S.mesSel, ultimo ? 1 : 0) || S.mesSel,
                   parte1:0, parte2:0, caju:0, acrescimos:0, descontos:0 };
      linhas.push(nova);
      montar(nova);
    }
  }

  linhas.slice().forEach(montar);
  garantir();

  const acoes=document.createElement("div");
  acoes.className="eacoes";
  acoes.innerHTML = `<button class="btn" id="en-salvar">${S.salvando?"Salvando…":"Salvar"}</button>
    <button class="btn ghost" id="en-cancelar">Cancelar</button>`;
  caixa.appendChild(acoes);

  $("en-cancelar").onclick = () => { S.editando=null; render(); };
  $("en-salvar").onclick   = () => salvarEntradas(linhas);
}

/** Entradas: uma linha por competência; mês tirado da lista é removido. */
function salvarEntradas(linhas){
  const novos = linhas.filter(l=>!vazioEntrada(l) && compDe(l.mes)).map(l=>({
    mes: "*",
    competencia: compDe(l.mes),
    parte1:Number(l.parte1)||0, parte2:Number(l.parte2)||0,
    caju:Number(l.caju)||0, acrescimos:Number(l.acrescimos)||0,
    descontos:-Math.abs(Number(l.descontos)||0)
  }));
  return sincronizar("entradas", (S.reg.entradas||[]).slice(), novos);
}

const vazioEntrada = l => !Number(l.parte1) && !Number(l.parte2) && !Number(l.caju)
  && !Number(l.acrescimos) && !Number(l.descontos);

