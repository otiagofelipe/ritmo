/* ═══ página do Caju ═══ */
function pgCaju(){
  const mes = S.mesSel;
  const ls = lancamentosCaju(mes);
  const gasto = soma(ls), teto = tetoCaju(mes);
  const sobra = teto - gasto;

  $("cj-kpis").innerHTML =
      kpi({nome:"gasto no mês", valor:gasto, destaque:true,
           sub:`${ls.length} lançamento${ls.length===1?"":"s"}`})
    + kpi({nome:"vale do mês", cor:CORES.caju, valor:teto, sub: teto ? "cadastrado em Entradas" : "sem vale em Entradas"})
    + kpi({nome:"disponível", cor:CORES.ok, valor:sobra, sinal: sobra<0 ? " neg" : "",
           sub: teto ? `${Math.round(Math.min(gasto/teto,9.99)*100)}% do vale usado` : "—"})
    + kpi({nome:"média por compra", cor:CORES.suave, valor: ls.length ? gasto/ls.length : 0,
           sub: ls.length ? `maior: ${BRL.format(Math.max(...ls.map(l=>Number(l.valor)||0)))}` : "—"});

  // o mesmo que o card do Caju mostra; o + abre o card já no lançamento
  $("cj-lista").innerHTML = lancamentosCajuHTML(mes);
  const mais = $("cj-lista").querySelector(".lst-mais");
  if(mais) mais.onclick = () => { cajuLancar = true; grupoAberto = "caju2"; editorMontado = null; renderEditor(); };

  graficoCaju("cj-grafico", mes);
}

/** Lançamentos do Caju: barra do vale, linhas e totais com o + de lançar (card e aba). */
function lancamentosCajuHTML(mes){
  const ls = lancamentosCaju(mes);
  const gasto = soma(ls), teto = tetoCaju(mes), livre = teto - gasto;
  return barraCaju(mes, gasto, teto)
    + `<div class="lst-lista">${ls.length ? ls.map(linhaCaju).join("") : `<div class="blank">Nada gasto no Caju nesta competência.</div>`}</div>`
    + rodapeLista([["gasto no mês", gasto], ...(teto ? [["disponível", livre, livre < 0 ? "neg" : "livre"]] : [])], "Lançar gastos");
}

/** Resumo do Caju no card: os mesmos quatro números da aba. */
function resumoCajuHTML(mes){
  const ls = lancamentosCaju(mes);
  const gasto = soma(ls), teto = tetoCaju(mes), sobra = teto - gasto;
  const item = (n, v, sub, cls="") => `<div class="${cls}"><small>${esc(n)}</small><b>${esc(v)}</b><span>${esc(sub)}</span></div>`;
  return `<div class="res-kpis">
    ${item("gasto no mês", BRL.format(gasto), `${ls.length} lançamento${ls.length===1?"":"s"}`)}
    ${item("vale do mês", BRL.format(teto), teto ? "cadastrado em Entradas" : "sem vale em Entradas")}
    ${item("disponível", BRL.format(sobra), teto ? `${Math.round(Math.min(gasto/teto,9.99)*100)}% do vale usado` : "—", sobra < 0 ? "neg" : "livre")}
    ${item("média por compra", BRL.format(ls.length ? gasto/ls.length : 0), ls.length ? `maior: ${BRL.format(Math.max(...ls.map(l=>Number(l.valor)||0)))}` : "—")}
  </div>`;
}

/** Gasto x vale nas últimas 12 faturas até a selecionada (aba e card). */
function graficoCaju(alvo, mes){
  const meses = S.faturas.filter(m=>m<=mes).slice(-12);
  grafico(alvo, {
    titulo:"gasto e vale do caju",
    labels: meses.map(mesCurto),
    series: [
      { nome:"vale",  cor:CORES.suave, valores: meses.map(m=>tetoCaju(m)) },
      { nome:"gasto", cor:CORES.caju,  valores: meses.map(m=>soma(lancamentosCaju(m))), area:true }
    ],
    destaque: meses.indexOf(mes),
    altura: 200,
    vazio: "Sem competências para comparar."
  });
}

/** O + da aba Caju abre o card já no lançamento. */
let cajuLancar = false;

/* Contexto do formulário aberto. Remontar a cada render() apagaria o
   que ainda não foi salvo — bastava um chip mudar, o app rebuscar a
   planilha ao voltar para a aba, ou trocar de página e voltar. */
let editorMontado = null;

/** Lançamento rápido pelo "+" do celular: o card abre direto no formulário. */
let rapido = null;
function lancarRapido(id){ rapido = id; grupoAberto = id; editorMontado = null; renderEditor(); }

/** Aviso curto embaixo da tela, com um "ver" que abre a lista do grupo. */
let avisoTimer = null;
function avisoLancado(texto, id){
  let el = document.getElementById("aviso");
  if(!el){
    el = document.createElement("div");
    el.id = "aviso"; el.className = "aviso"; el.setAttribute("role","status");
    document.body.appendChild(el);
  }
  el.innerHTML = `<span></span><button type="button">ver</button>`;
  el.firstChild.textContent = texto;
  el.lastChild.onclick = () => { esconder(); grupoAberto = id; renderEditor(); };
  const esconder = () => { el.classList.remove("on"); };
  requestAnimationFrame(()=>el.classList.add("on"));
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(esconder, 5000);
}

/** Grupos cujo editor abre no card flutuante. */
const EM_CARD = new Set(["fixos","devem","devo","caju2"]);

function renderEditor(){
  const contexto = grupoAberto
    ? grupoAberto+"|"+S.mesSel+"|"+(S.salvando?"1":"0")
    : null;
  if(contexto && contexto === editorMontado) return;   // já está desenhado
  const tinhaEditor = editorMontado !== null;
  editorMontado = contexto;

  GRUPOS.forEach(g=>{ const el=$(g.alvo||"m-editor"); if(el) el.innerHTML=""; });
  /* Só fecha o card se ele era de um editor: os outros cards (semana)
     continuam abertos quando a página redesenha por baixo. */
  if(!EM_CARD.has(grupoAberto) && tinhaEditor) fecharModal();
  if(!grupoAberto) return;

  const g = grupoDe(grupoAberto);
  // contas fixas, me devem e eu devo abrem num card flutuante, por cima da página
  const box = EM_CARD.has(g.id)
    ? abrirModal(()=>{ grupoAberto = null; renderEditor(); })
    : $(g.alvo||"m-editor");
  if(!box) return;
  const campos = g.campos || ["nome","valor"];

  if(g.id==="fixos")    return editorFixas(g, box);
  if(g.id==="devem" || g.id==="devo") return editorDividas(g, box);
  if(g.id==="caju2") return editorCaju(g, box);

  // grupos "soAdiciona" abrem em branco: o já lançado vive no extrato
  const copiar = i => ({
    id:i.id||"", pessoa:i.pessoa||"",
    nome:i.nome, apelido:i.apelido||"", valor:i.valor, data:i.data||"",
    pago:!!i.pago, pagos:String(i.pagos||""), terceiro:!!i.terceiro,
    parcelas: parcelasDe(i).indet ? INDETERMINADO : parcelasDe(i).n,
    mesInicio:compDe(i.mesInicio)||"", inicio:compDe(i.inicio)||"", fim:compDe(i.fim)||""
  });

  // grupos "soAdiciona" abrem em branco: o já lançado vive no extrato
  let itens = g.soAdiciona ? [] : itensGrupo(g.id).map(copiar);


  box.innerHTML = `<div class="editor">
    <h3>${esc(g.titulo)} <span class="mes">${esc(g.todosOsMeses?"todo mês":rotuloFatura(S.mesSel))}</span></h3>
    ${g.duasLinhas?`<div class="ecab">${esc(g.rotulos.nome)}</div>`:""}
    <div id="e-linhas"></div>
    <div class="esoma"><span>Total</span><span class="v"></span></div>
    ${campos.includes("pago")?`<div class="esoma sub"><span>Pago</span><span class="p"></span></div>
      <div class="esoma sub"><span>Em aberto</span><span class="a"></span></div>`:""}
    <div class="eacoes">
      <button class="btn" id="e-salvar">${S.salvando?"Salvando…":"Salvar"}</button>
      <button class="btn ghost" id="e-fechar">Fechar</button>
    </div></div>`;

  const linhas = $("e-linhas");
  const vazia = it => !String(it.nome||"").trim() && !Number(it.valor);
  const somar = () => {
    const tot=itens.reduce((a,i)=>a+(Number(i.valor)||0),0);
    // parcelado: o total é o valor cheio, mas o mês só sente a fatia
    const noMes=itens.reduce((a,i)=>{
      const { n, indet } = parcelasDe(i);
      if(indet || n<=1) return a + (Number(i.valor)||0);
      return a + fatiaParcela(i.valor, n, 0);
    },0);
    box.querySelector(".esoma .v").textContent = BRL.format(tot)
      + (Math.abs(noMes-tot)>0.005 ? ` · ${BRL.format(noMes)} neste mês` : "");
    const p=box.querySelector(".esoma .p");
    if(p){
      const pg=itens.filter(i=>i.pago).reduce((a,i)=>a+(Number(i.valor)||0),0);
      p.textContent=BRL.format(pg);
      box.querySelector(".esoma .a").textContent=BRL.format(tot-pg);
    }
  };

  /** Mantém sempre uma linha em branco no fim, pronta para digitar. */
  function garantirFinal(){
    while(itens.length>1 && vazia(itens[itens.length-1]) && vazia(itens[itens.length-2])){
      itens.pop();
      if(linhas.lastChild) linhas.removeChild(linhas.lastChild);
    }
    if(!itens.length || !vazia(itens[itens.length-1])){
      const nova={nome:"",apelido:"",valor:0,pago:false,pagos:"",terceiro:false,parcelas:1,
                  mesInicio: campos.includes("mesInicio") ? S.mesSel : "",
                  inicio:"", fim:"",
                  data: campos.includes("data") ? hojeISO() : ""};
      itens.push(nova);
      linhas.appendChild(criarLinha(nova));
    }
  }

  /** Cada linha é criada uma vez e nunca redesenhada: o cursor fica onde está. */
  function criarLinha(it){
    const row=document.createElement("div");
    row.className="erow"+(g.duasLinhas?" duplo":"")+(it.continuacao?" continuacao":"");

    const nome=document.createElement("input");
    nome.placeholder=g.rotulos.nome||"Nome"; nome.value=it.nome||"";
    nome.addEventListener("input",()=>{ it.nome=nome.value; somar(); garantirFinal(); });
    row.appendChild(nome);

    const l2=document.createElement("div");
    if(g.duasLinhas){ l2.className="l2"; row.appendChild(l2); }
    const dest = g.duasLinhas ? l2 : row;

    dest.appendChild(envolver(g.rotulos.valor || "valor",
      campoMoeda(it.valor, v=>{
        it.valor=v;
        if(it.continuacao && v){ it.continuacao=false; row.classList.remove("continuacao"); }
        somar(); garantirFinal();
      })));

    if(campos.includes("dia")){
      // conta fixa se repete todo mês: guarda só o dia
      const dia=document.createElement("input");
      dia.className="dia"; dia.inputMode="numeric"; dia.placeholder="dia";
      dia.value=it.data||"";
      dia.addEventListener("input",()=>{
        const n=Math.min(31,Math.max(0,parseInt(dia.value.replace(/\D/g,""),10)||0));
        dia.value = n?String(n):""; it.data=dia.value; garantirFinal();
      });
      dest.appendChild(envolver("dia", dia));
    }

    if(campos.includes("data")){
      const data=document.createElement("input");
      data.type="date"; data.className="dt"; data.value=it.data||hojeISO();
      it.data=data.value;
      data.addEventListener("input",()=>{ it.data=data.value; garantirFinal(); });
      dest.appendChild(data);

      const setas=document.createElement("span");
      setas.className="setas";
      [["←",-1,"dia anterior"],["↑",0,"hoje"],["→",1,"dia seguinte"]].forEach(([txt,delta,tit])=>{
        const b=document.createElement("button");
        b.textContent=txt; b.title=tit; b.type="button";
        b.onclick=()=>{
          data.value = delta===0 ? hojeISO() : somaDias(data.value,delta);
          it.data=data.value; garantirFinal();
        };
        setas.appendChild(b);
      });
      dest.appendChild(setas);
    }

    if(campos.includes("apelido")){
      const ap=document.createElement("input");
      ap.placeholder="como mostrar";
      ap.title="Nome exibido na tela; o campo ao lado é o que casa com as transações";
      ap.value = it.apelido || "";
      ap.addEventListener("input",()=>{ it.apelido=ap.value; garantirFinal(); });
      dest.appendChild(ap);
    }

    if(campos.includes("mesInicio")){
      // competência da 1ª parcela: o registro é único e se espalha daqui
      const mi=document.createElement("input");
      mi.type="month"; mi.className="dt";
      mi.title="Competência da primeira parcela";
      mi.value = it.mesInicio || S.mesSel || "";
      it.mesInicio = mi.value;
      mi.addEventListener("input",()=>{ it.mesInicio=mi.value; somar(); garantirFinal(); });
      dest.appendChild(envolver("1ª parcela", mi));
    }

    if(campos.includes("vigencia")){
      // sem término, a conta vale para sempre; com término, ela some
      // dali para a frente sem apagar o histórico dos meses anteriores
      [["inicio","início","Primeira competência em que a conta vale"],
       ["fim","término","Última competência; vazio = sem fim"]].forEach(([campo,rot,tit])=>{
        const el=document.createElement("input");
        el.type="month"; el.className="dt"; el.title=tit;
        el.value = it[campo] || "";
        el.addEventListener("input",()=>{ it[campo]=el.value; garantirFinal(); });
        dest.appendChild(envolver(rot, el));
      });
    }

    if(campos.includes("parcelas")){
      /* O valor digitado é sempre o total; a divisão pelos meses é
         feita na exibição. "Indeterminado" não divide nada: repete o
         valor cheio todo mês, a partir da 1ª competência. */
      const par=document.createElement("select");
      par.className="parc";
      par.title="Em quantas parcelas dividir";
      par.innerHTML = `<option value="${INDETERMINADO}">Indeterminado</option>`
        + Array.from({length:MAX_PARCELAS}, (_,k)=>
            `<option value="${k+1}">${k+1}x</option>`).join("");
      par.value = String(parcelasDe(it).indet ? INDETERMINADO : parcelasDe(it).n);
      par.addEventListener("change",()=>{
        it.parcelas = Number(par.value);
        somar();
        garantirFinal();
      });
      dest.appendChild(envolver("parcelas", par));
    }

    if(campos.includes("pago")||campos.includes("terceiro")){
      const ehTerceiro=campos.includes("terceiro");
      const flag=document.createElement("input");
      flag.type="checkbox";
      flag.checked = ehTerceiro ? !!it.terceiro : estaPago(it, S.mesSel);
      flag.title = ehTerceiro
        ? "Não é meu: cobra no meu cartão, mas é de outra pessoa"
        : "Pago nesta competência";
      flag.addEventListener("change",()=>{
        if(ehTerceiro){ it.terceiro=flag.checked; row.classList.toggle("de-outro",it.terceiro); }
        else {
          // marca só a competência aberta; as outras parcelas seguem em aberto
          it.pagos = alternarPago(it, S.mesSel, flag.checked);
          it.pago = flag.checked;
          row.classList.toggle("quitada", flag.checked);
        }
        somar();
      });
      row.classList.toggle(ehTerceiro?"de-outro":"quitada",
        ehTerceiro ? !!it.terceiro : estaPago(it, S.mesSel));
      dest.appendChild(envolver(ehTerceiro?"de terceiro":"pago", flag));
    }

    const rm=document.createElement("button");
    rm.className="rm"; rm.textContent="×"; rm.title="Remover"; rm.type="button";
    rm.onclick=()=>{
      const i=itens.indexOf(it);
      if(i>=0) itens.splice(i,1);
      row.remove(); somar(); garantirFinal();
    };
    dest.appendChild(rm);
    return row;
  }

  itens.forEach(it=>linhas.appendChild(criarLinha(it)));
  garantirFinal();
  somar();

  $("e-salvar").onclick = () => salvarGrupo(g.id,
    itens
      // linha de continuação intocada é só um convite: não vai para a planilha
      .filter(it=>String(it.nome||"").trim() && !(it.continuacao && !Number(it.valor)))
      .map(it => linhaPayload(g.id, it)));
  $("e-fechar").onclick = () => { grupoAberto=null; renderEditor(); };
}


