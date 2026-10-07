/* ═══════════ Gastos fixos ═══════════ */

function pgFixos(){
  const todas = itensGrupo("fixos");
  const vigentes = fixasVigentes();
  const { meuTotal, deOutros, aCobrar } = listaFixas(vigentes, true);
  const encerradas = todas.filter(f=>!vigenteEm(f, S.mesSel));

  $("fx-kpis").innerHTML =
      kpi({nome:"meu total no mês", valor:meuTotal, destaque:true})
    + kpi({nome:"de terceiros", cor:CORES.suave, valor:deOutros})
    + kpi({nome:"ainda a cobrar", cor:CORES.aviso, valor:aCobrar});

  $("fx-lista").innerHTML = vigentes.length
    ? barraFixas(vigentes)
      + `<div class="lst-lista">${vigentes.slice().sort((a,b)=>ordemDia(a.data)-ordemDia(b.data))
          .map(f=>linhaFixa(f, { comVigencia:true })).join("")}</div>`
      + rodapeLista([["meu total", meuTotal], ...(deOutros ? [["de terceiros", deOutros]] : []), ["a cobrar", aCobrar, "aberto"]])
      + (encerradas.length?`<details class="dobra">
           <summary><svg class="ic seta" viewBox="0 0 24 24"><use href="#i-chevron"/></svg>
             Fora de vigência nesta competência
             <span class="cnt">${encerradas.length}</span></summary>
           <div class="lst-lista">${encerradas.map(f=>linhaLista({ cls:"de-outro", ic: iconeFixa(rotuloFixa(f)), titulo: rotuloFixa(f),
             valor: Number(f.valor)||0, sub: esc(vigenciaTexto(f)) })).join("")}</div>
         </details>`
        :"")
    : `<div class="blank">Nenhuma conta fixa vigente. Use “adicionar / editar”.</div>`;

  // ── evolução: soma das vigentes em cada competência conhecida
  const meses = S.faturas;
  grafico("fx-grafico", {
    titulo:"evolução dos gastos fixos",
    labels: meses.map(mesCurto),
    series: [
      { nome:"total",      cor:CORES.acento, valores: meses.map(m=>somaFixas(m, null)),  area:true },
      { nome:"meus",       cor:CORES.ok, valores: meses.map(m=>somaFixas(m, false)) },
      { nome:"terceiros",  cor:CORES.aviso, valores: meses.map(m=>somaFixas(m, true))  }
    ],
    destaque: meses.indexOf(S.mesAberto),
    altura: 210,
    vazio: "Sem competências para comparar."
  });
}

/** Soma das contas fixas vigentes numa competência. `quem`: null=tudo, false=meus, true=terceiros. */
function somaFixas(mes, quem){
  return itensGrupo("fixos")
    .filter(f=>vigenteEm(f, mes) && (quem===null || !!f.terceiro===quem))
    .reduce((a,f)=>a+(Number(f.valor)||0),0);
}

