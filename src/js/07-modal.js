/* ─────────── card flutuante (modal) ─────────── */

/** Abre (ou reaproveita) o card flutuante e devolve onde desenhar. */
/**
 * Com um card aberto, a barra do mês continua à mão: ela sai de dentro da
 * página (que desfoca atrás do véu) e fica fixa no mesmo lugar da tela, por
 * cima do véu. Ao fechar o card, volta para onde estava.
 */
function soltarBarra(sim){
  const bar = $("barra-filtros");
  if(!bar) return;
  if(sim && !bar._lugar){
    const r = bar.getBoundingClientRect();
    if(r.bottom <= 0 || r.top >= innerHeight) return;        // fora da tela: deixa quieta
    const lugar = document.createElement("div");
    // presa no topo ela já está fora do fluxo (o espaço dela é o #filtros-lugar):
    // o marcador fica sem altura, senão a página cresce e pula ao abrir o card
    const cs = getComputedStyle(bar);
    lugar.style.height = cs.position === "fixed" ? "0px"
      : (bar.offsetHeight + (parseFloat(cs.marginTop)||0) + (parseFloat(cs.marginBottom)||0)) + "px";
    lugar.style.overflowAnchor = "none";
    bar.parentNode.insertBefore(lugar, bar);
    bar._lugar = lugar; bar._estilo = bar.getAttribute("style") || "";
    bar.classList.add("sobre-veu");
    Object.assign(bar.style, { top: r.top+"px", left: r.left+"px", width: r.width+"px" });

    document.body.appendChild(bar);
    // o card começa abaixo da barra (medida já no lugar novo), sem ficar por baixo dela
    document.documentElement.style.setProperty("--veu-topo", Math.ceil(bar.getBoundingClientRect().bottom + 10) + "px");
  } else if(!sim && bar._lugar){
    bar._lugar.replaceWith(bar); bar._lugar = null;
    document.documentElement.style.removeProperty("--veu-topo");
    bar.classList.remove("sobre-veu");
    bar.setAttribute("style", bar._estilo);
  }
}
let voltandoDoCard = false;
addEventListener("popstate", ()=>{
  if(voltandoDoCard){ voltandoDoCard = false; return; }       // fomos nós que voltamos
  const veu = document.getElementById("modal-veu");
  if(veu && !veu._fechando){ veu._porVoltar = true; veu._fechar(); }
});
/**
 * refazer: redesenha o conteúdo do card com os filtros atuais (mês, pix,
 * rolê, chips). Quem não passa, fica como está ao mexer nos filtros.
 */
function abrirModal(aoFechar, refazer){
  let veu = document.getElementById("modal-veu");
  // fechado e reaberto no mesmo instante (ex.: salvar e voltar para a lista):
  // o mesmo card continua, sem animar de novo
  if(veu && veu._fechando){ cancelAnimationFrame(veu._fechando); veu._fechando = 0; }
  if(!veu){
    veu = document.createElement("div");
    veu.id = "modal-veu"; veu.className = "modal-veu";
    veu.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true"></div>`;
    document.body.appendChild(veu);
    soltarBarra(true);
    // o "voltar" do celular fecha o card em vez de sair da página
    try{ history.pushState({ritmoCard:1}, ""); veu._hist = true; }catch(e){}
    document.body.classList.add("modal-aberto");
  }
  veu.onclick = e => { if(e.target === veu) aoFechar(); };
  veu._fechar = aoFechar;
  veu._refazer = refazer || null;
  const card = veu.firstElementChild;
  card.scrollTop = 0;
  return card;
}
function fecharModal(){
  const veu = document.getElementById("modal-veu");
  if(!veu || veu._fechando) return;
  // espera um quadro: se o card for reaberto logo em seguida, ele fica
  veu._fechando = requestAnimationFrame(()=>{
    veu._fechando = 0;
    soltarBarra(false);
    // fechou por dentro (×, véu, salvar): tira a entrada que o card pôs no histórico
    if(veu._hist && !veu._porVoltar){ voltandoDoCard = true; try{ history.back(); }catch(e){ voltandoDoCard = false; } }
    document.body.classList.remove("modal-aberto");
    // sai pelo mesmo caminho: esmaece e desfoca, enquanto a página volta ao foco
    veu.classList.add("saindo");
    veu.removeAttribute("id");
    setTimeout(()=>veu.remove(), 260);
  });
}
/** Mudou um filtro com o card aberto: o card acompanha, no mesmo ponto da rolagem. */
function refazerCard(){
  const veu = document.getElementById("modal-veu");
  if(!veu || veu._fechando || !veu._refazer) return;
  const card = veu.firstElementChild, y = card.scrollTop;
  veu._refazer();
  card.scrollTop = y;
}
document.addEventListener("keydown", e=>{
  const veu = document.getElementById("modal-veu");
  if(e.key==="Escape" && veu && !document.querySelector(".dl-lista")) veu._fechar();
});

/**
 * Editor das contas fixas, num card flutuante e em dois passos.
 *
 * 1. Lista: as despesas que valem na competência aberta e, dobradas no
 *    fim, as que estão fora de vigência nela. Clicar abre a despesa.
 * 2. Cartão da despesa: os campos da despesa (exibir como, cobrado em,
 *    na fatura, de terceiro) e as faixas de valor (valor, dia, início).
 *    Sempre há uma faixa em branco no fim, pronta para o próximo valor.
 */
function editorFixas(g, box){
  const despesas = despesasFixas();
  // pelo "+" do celular: abre direto numa despesa nova; salvar fecha e avisa
  const modoRapido = rapido === g.id; rapido = null;
  let aberta = modoRapido
    ? { orig:null, d:{ apelido:"", nome:"", nomes:[], cobranca:"picpay", terceiro:false, faixas:[] } }
    : null;                  // { orig, d }: a despesa no cartão (cópia), ou null = lista
  let foraAberto = false;

  const copia = d => ({ ...d, nomes: nomesFatura(d), faixas: d.faixas.map(f=>({...f})) });
  // veio de uma linha de Contas fixas do Dashboard: abre direto nessa despesa
  if(!aberta && fixaAlvo){
    const alvo = despesas.find(d => d.chave === fixaAlvo);
    if(alvo) aberta = { orig:alvo, d:copia(alvo) };
  }
  fixaAlvo = null;
  const desenhar = () => { box.scrollTop = 0; aberta ? cartao() : lista(); };
  const fechar = () => { grupoAberto = null; renderEditor(); };

  /** Grava todas as despesas e volta para a lista com os dados novos. */
  function salvarTudo(aviso){
    const itens = [];
    for(const d of despesas){
      const apelido = String(d.apelido||"").trim();
      const nome = (d.nomes ? d.nomes.join(SEP_FATURA) : String(d.nome||"").trim()) || apelido;
      if(!nome) continue;
      const ord = d.faixas.filter(f=>!f._branca)
        .sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
      ord.forEach((f,n)=>{
        if(!Number(f.valor)) return;          // valor 0 só marca até quando a anterior vale
        const prox = ord[n+1];
        itens.push(linhaPayload("fixos", {
          id:f.id||"", nome, apelido, terceiro:!!d.terceiro, cobranca:d.cobranca||"picpay",
          valor:f.valor, data:f.dia||"", inicio:f.inicio||"",
          fim: prox && prox.inicio ? somaMeses(prox.inicio, -1) : ""
        }));
      });
    }
    salvarGrupo("fixos", itens);
    if(modoRapido){ avisoLancado(aviso, "fixos"); return; }
    // salvarGrupo fecha o editor; reabre na lista, já com o que foi gravado
    grupoAberto = "fixos";
    render();
  }

  function itemLista(d, sub, valor){
    const b = document.createElement("button");
    b.type = "button"; b.className = "fx-item" + (d.terceiro ? " de-outro" : "");
    b.innerHTML = `<span class="nm"><span class="t"></span>${d.terceiro?`<span class="tag" title="De terceiro: não é meu, só passa no meu cartão">3º</span>`:""}${
      d.cobranca==="pix"?`<span class="tag">Pix</span>`:""}<span class="sub"></span></span>
      <span class="vl">${valor==null?"":BRL.format(valor)}</span>
      <svg class="ic" viewBox="0 0 24 24"><use href="#i-right"/></svg>`;
    b.querySelector(".t").textContent = d.apelido || nomesFatura(d)[0] || "sem nome";
    b.querySelector(".sub").textContent = sub;
    b.onclick = () => { aberta = { orig:d, d:copia(d) }; desenhar(); };
    return b;
  }

  const topo = (titulo, mes, voltar) => `<div class="modal-topo">
      ${voltar?`<button type="button" class="modal-ic fx-voltar" title="Voltar para a lista" aria-label="Voltar">
        <svg class="ic" viewBox="0 0 24 24"><use href="#i-left"/></svg></button>`:""}
      <h3><span class="fx-titulo">${esc(titulo)}</span>${mes?` <span class="mes">${esc(mes)}</span>`:""}</h3>
      <button type="button" class="modal-ic fx-x" title="Fechar" aria-label="Fechar">×</button>
    </div>`;

  function lista(){
    const mes = S.mesSel;
    const vig = despesas.filter(d=>despesaVigente(d, mes))
      .sort((a,b)=>ordemDia(faixaDaDespesa(a, mes).dia)-ordemDia(faixaDaDespesa(b, mes).dia));
    const fora = despesas.filter(d=>!despesaVigente(d, mes));
    const total = vig.reduce((a,d)=>a+(Number(faixaDaDespesa(d, mes).valor)||0), 0);

    box.innerHTML = `<div class="fx-ed">
      ${topo(g.titulo, rotuloFatura(mes), false)}
      <div class="fx-itens"></div>
      <button type="button" class="fx-novo"><svg class="ic" viewBox="0 0 24 24"><use href="#i-plus"/></svg>Nova despesa</button>
      <div class="esoma"><span>Vigente neste mês</span><span class="v">${esc(BRL.format(total))}</span></div>
      ${fora.length?`<details class="dobra"${foraAberto?" open":""}>
        <summary><svg class="ic seta" viewBox="0 0 24 24"><use href="#i-chevron"/></svg>
          Fora de vigência nesta competência <span class="cnt">${fora.length}</span></summary>
        <div class="fx-fora"></div></details>`:""}
    </div>`;

    const caixa = box.querySelector(".fx-itens");
    if(!vig.length) caixa.innerHTML = `<div class="blank">Nenhuma conta fixa vale nesta competência.</div>`;
    vig.forEach(d=>{
      const f = faixaDaDespesa(d, mes);
      caixa.appendChild(itemLista(d,
        [f.dia ? `todo dia ${f.dia}` : "", d.cobranca==="pix" ? "Pix" : "PicPay"].filter(Boolean).join(" · "),
        Number(f.valor)||0));
    });
    const cxFora = box.querySelector(".fx-fora");
    if(cxFora) fora.forEach(d=>cxFora.appendChild(itemLista(d, foraDeVigencia(d, mes), null)));
    const dobra = box.querySelector(".dobra");
    if(dobra) dobra.addEventListener("toggle", ()=>{ foraAberto = dobra.open; });

    box.querySelector(".fx-novo").onclick = () => {
      aberta = { orig:null, d:{ apelido:"", nome:"", nomes:[], cobranca:"picpay", terceiro:false, faixas:[] } };
      desenhar();
    };
    box.querySelector(".fx-x").onclick = fechar;
  }

  function cartao(){
    const { orig, d } = aberta;
    box.innerHTML = `<div class="fx-ed">
      ${topo(d.apelido.trim() || (orig ? "Sem nome" : "Nova despesa"), "", !modoRapido)}
      <div class="erow fx-cab"></div>
      <div class="fx-secao">Valores</div>
      <div class="fx-faixas"></div>
      <div class="fx-dica">Cada valor vale do início até o próximo. Para encerrar, use valor 0 a partir do mês em que parou.</div>
      <div class="eacoes">
        <button class="btn" id="e-salvar">Salvar</button>
        <button class="btn ghost" id="e-voltar">${modoRapido?"Cancelar":"Voltar"}</button>
        ${orig?`<button class="btn ghost perigo" id="e-remover">Remover</button>`:""}
      </div></div>`;

    const titulo = box.querySelector(".fx-titulo");
    const pintarTitulo = () => { titulo.textContent = d.apelido.trim() || (orig ? "Sem nome" : "Nova despesa"); };

    // ── campos da despesa
    const cab = box.querySelector(".fx-cab");
    const ap = document.createElement("input");
    ap.placeholder = "Nome da despesa"; ap.value = d.apelido;
    ap.addEventListener("input", ()=>{ d.apelido = ap.value; pintarTitulo(); });
    const fAp = envolver("exibir como", ap); fAp.classList.add("fx-a-ap");

    const cb = document.createElement("select");
    cb.className = "cob";
    COBRANCAS_FIXA.forEach(([v,rot])=>{ const o=document.createElement("option"); o.value=v; o.textContent=rot; cb.appendChild(o); });
    cb.value = d.cobranca || "picpay";
    cb.addEventListener("change", ()=>{ d.cobranca = cb.value; });
    const fCb = envolver("cobrado em", cb); fCb.classList.add("fx-a-cb");

    // na fatura: as descrições escolhidas viram etiquetas; o botão abre a lista
    const fat = document.createElement("div");
    fat.className = "fx-fat";
    const pintarFatura = () => {
      fat.innerHTML = "";
      d.nomes.forEach(n=>{
        const chip = document.createElement("span"); chip.className = "fx-chip";
        chip.innerHTML = `<span></span><button type="button" aria-label="Tirar">×</button>`;
        chip.firstChild.textContent = n;
        chip.lastChild.onclick = () => { d.nomes = d.nomes.filter(x=>x!==n); pintarFatura(); };
        fat.appendChild(chip);
      });
      const add = document.createElement("button");
      add.type = "button"; add.className = "fx-add";
      add.innerHTML = `<svg class="ic" viewBox="0 0 24 24"><use href="#i-plus"/></svg>${d.nomes.length?"escolher mais":"escolher na lista"}`;
      add.onclick = () => abrirListaFatura(fat, d.nomes, lista=>{ d.nomes = lista; pintarFatura(); });
      fat.appendChild(add);
    };
    pintarFatura();
    const fFat = document.createElement("div");
    fFat.className = "efield fx-a-fat";
    fFat.innerHTML = `<span class="tagx">na fatura</span>`;
    fFat.appendChild(fat);

    const t = document.createElement("input");
    t.type = "checkbox"; t.checked = !!d.terceiro; t.id = "fx-terceiro";
    t.addEventListener("change", ()=>{ d.terceiro = t.checked; });
    const fT = document.createElement("label");
    fT.className = "fx-a-ter"; fT.htmlFor = "fx-terceiro";
    fT.append(t, Object.assign(document.createElement("span"), { innerHTML:"De terceiro <small>não é meu, só passa no meu cartão</small>" }));

    cab.append(fAp, fCb, fFat, fT);

    // ── faixas de valor
    const caixa = box.querySelector(".fx-faixas");
    const usar = f => { f._branca = false; garantir(); };

    function montar(f){
      const row = document.createElement("div");
      row.className = "erow faixa" + (f._branca ? " branca" : "");
      const fV = envolver("valor", campoMoeda(f.valor, v=>{ f.valor = v; usar(f); row.classList.remove("branca"); }));
      fV.classList.add("fx-a-v");

      const dia = document.createElement("input");
      dia.className = "dia"; dia.inputMode = "numeric"; dia.placeholder = "—"; dia.value = f.dia || "";
      dia.addEventListener("input", ()=>{
        const n = Math.min(31, Math.max(0, parseInt(dia.value.replace(/\D/g,""),10)||0));
        dia.value = n ? String(n) : ""; f.dia = dia.value; usar(f); row.classList.remove("branca");
      });
      const fD = envolver("dia", dia); fD.classList.add("fx-a-d");

      const fI = envolver("início", campoCompetencia(f.inicio, v=>{ f.inicio = v; usar(f); row.classList.remove("branca"); }, true));
      fI.classList.add("fx-a-i");

      const rm = document.createElement("button");
      rm.className = "rm fx-a-rm"; rm.type = "button"; rm.textContent = "×"; rm.title = "Remover este valor";
      rm.onclick = () => {
        const i = d.faixas.indexOf(f);
        if(i >= 0) d.faixas.splice(i, 1);
        row.remove(); garantir();
      };
      row.append(fV, fD, fI, rm);
      caixa.appendChild(row);
    }

    /** Uma faixa em branco sempre esperando no fim. */
    function garantir(){
      if(!d.faixas.some(f=>f._branca)){
        // o caso comum é "mudou de preço a partir deste mês": já vem com o
        // mês aberto e o mesmo dia do valor anterior
        const ant = d.faixas.filter(f=>!f._branca).slice(-1)[0];
        const nova = { id:"", valor:0, dia: ant ? ant.dia : "", inicio:S.mesSel, _branca:true };
        d.faixas.push(nova);
        montar(nova);
      }
    }

    d.faixas.sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
    d.faixas.forEach(montar);
    garantir();

    const voltar = () => { if(modoRapido) return fechar(); aberta = null; desenhar(); };
    const vt = box.querySelector(".fx-voltar"); if(vt) vt.onclick = voltar;
    box.querySelector(".fx-x").onclick = fechar;
    $("e-voltar").onclick = voltar;

    $("e-salvar").onclick = () => {
      if(!String(d.apelido).trim() && !d.nomes.length){ ap.focus(); return; }
      if(!orig && !d.faixas.some(f=>!f._branca && Number(f.valor))){
        const dica = box.querySelector(".fx-dica");
        dica.textContent = "Informe ao menos um valor.";
        dica.classList.add("erro");
        return;
      }
      d.faixas = d.faixas.filter(f=>!f._branca);
      if(orig) despesas[despesas.indexOf(orig)] = d; else despesas.push(d);
      salvarTudo(`${d.apelido.trim() || d.nomes[0] || "Despesa"} salva em Gastos fixos`);
    };

    const rmDesp = $("e-remover");
    if(rmDesp) rmDesp.onclick = () => {
      if(!confirm(`Remover “${orig.apelido || nomesFatura(orig)[0] || ""}” e todos os valores dela?`)) return;
      despesas.splice(despesas.indexOf(orig), 1);
      salvarTudo();
    };

    if(!orig) ap.focus();
  }

  desenhar();
}

/**
 * Editor de Me devem / Eu devo, no mesmo card flutuante das contas fixas.
 *
 * 1. Lista: os registros que caem na competência aberta (com a parcela do
 *    mês e o status) e, dobrados no fim, os de outras competências.
 * 2. Cartão do registro: pessoa, descrição, valor total, parcelas e 1ª
 *    parcela; embaixo, cada parcela com o seu mês e o seu status, que se
 *    marca ali mesmo — inclusive meses passados.
 */
function editorDividas(g, box){
  const id = g.id;
  const crus = S.reg[chavePlanilha(id)] || [];
  const quem = id==="devem" ? "quem me deve" : "a quem devo";
  // pelo "+" do celular: abre direto num registro novo; salvar fecha e avisa
  const modoRapido = rapido === id; rapido = null;
  let aberta = modoRapido
    ? { orig:null, d:{ pessoa:"", nome:"", valor:0, parcelas:1, mesInicio:S.mesSel, pagos:"" } }
    : null;                  // { orig, d }: o registro no cartão (cópia), ou null = lista

  const desenhar = () => { box.scrollTop = 0; aberta ? cartao() : lista(); };
  const fechar = () => { grupoAberto = null; renderEditor(); };
  const nomeDe = r => String(r.pessoa||"").trim() || String(r.nome||"").trim() || "sem nome";

  /* Meses pagos de um registro. O booleano antigo vale só para o mês de
     início (mesma regra do estaPago). */
  const pagosIniciais = r => {
    const set = pagosDe(r);
    if(!set.size && r.pago) set.add(inicioDe(r));
    return [...set].sort().join(";");
  };
  const copia = r => ({
    pessoa: String(r.pessoa||""), nome: r.pessoa ? String(r.nome||"") : "",
    valor: Number(r.valor)||0,
    parcelas: parcelasDe(r).indet ? INDETERMINADO : parcelasDe(r).n,
    mesInicio: inicioDe(r) || S.mesSel,
    pagos: pagosIniciais(r)
  });

  /** As parcelas do registro em edição: mês, número e valor de cada uma. */
  function parcelasDoCartao(d){
    const ini = compDe(d.mesInicio) || S.mesSel;
    const { n, indet } = parcelasDe(d);
    if(indet){
      // sem prazo: do início até a competência aberta (no máximo as 36 últimas)
      const k = Math.max(0, distMeses(ini, S.mesSel) ?? 0);
      const de = Math.max(0, k - MAX_PARCELAS + 1);
      return Array.from({length:k-de+1}, (_,j)=>({
        comp: somaMeses(ini, de+j), rot: `${de+j+1}º`, valor: Number(d.valor)||0 }));
    }
    return Array.from({length:n}, (_,k)=>({
      comp: somaMeses(ini, k), rot: n===1 ? "única" : `${k+1}/${n}`,
      valor: n===1 ? (Number(d.valor)||0) : fatiaParcela(d.valor, n, k) }));
  }

  /** Grava um registro (ou o remove) e volta para a lista com os dados novos. */
  function gravar(orig, d){
    const novos = [];
    if(d){
      const base = orig || {};
      const ini = compDe(d.mesInicio) || S.mesSel;
      novos.push({...base,
        id: base.id || novoId(),
        mes: ini, mesInicio: ini,
        pessoa: d.pessoa.trim(),
        // sem descrição, o nome da pessoa também serve de nome
        nome: d.nome.trim() || d.pessoa.trim(),
        valor: Number(d.valor)||0,
        parcelas: d.parcelas,
        pagos: d.pagos, pago: false
      });
    }
    sincronizar(id, orig ? [orig] : [], novos);
    if(modoRapido && d){ avisoLancado(`${BRL.format(Number(d.valor)||0)} anotado em ${g.titulo}`, id); return; }
    // sincronizar fecha o editor; reabre na lista, já com o que foi gravado
    grupoAberto = id;
    render();
  }

  const topo = (titulo, mes, voltar) => `<div class="modal-topo">
      ${voltar?`<button type="button" class="modal-ic fx-voltar" title="Voltar para a lista" aria-label="Voltar">
        <svg class="ic" viewBox="0 0 24 24"><use href="#i-left"/></svg></button>`:""}
      <h3><span class="fx-titulo">${esc(titulo)}</span>${mes?` <span class="mes">${esc(mes)}</span>`:""}</h3>
      <button type="button" class="modal-ic fx-x" title="Fechar" aria-label="Fechar">×</button>
    </div>`;

  function lista(){
    const mes = S.mesSel;
    const doMes = itensDoMes(id, mes).filter(i=>!i.fixaPix && crus[i.refIdx]);
    const vig = doMes.slice().sort((a,b)=>(a.pago-b.pago) || nomeDe(a).localeCompare(nomeDe(b)));
    // contas fixas pagas por Pix: entram em Eu devo e aparecem aqui, mas se editam em Gastos fixos
    const pix = id==="devo" ? itensDoMes(id, mes).filter(i=>i.fixaPix) : [];
    const todos = [...vig, ...pix];
    const total = todos.reduce((a,i)=>a+(Number(i.valor)||0), 0);
    const aberto = todos.filter(i=>!i.pago).reduce((a,i)=>a+(Number(i.valor)||0), 0);

    box.innerHTML = `<div class="fx-ed">
      ${topo(g.titulo, rotuloFatura(mes), false)}
      <div class="fx-itens cd-lista"></div>
      <button type="button" class="fx-novo"><svg class="ic" viewBox="0 0 24 24"><use href="#i-plus"/></svg>Novo registro</button>
      ${caixasTotais([["neste mês", total], ["em aberto", aberto, "aberto"]])}
    </div>`;

    const caixa = box.querySelector(".fx-itens");
    if(!todos.length) caixa.innerHTML = `<div class="blank">Nada anotado nesta competência.</div>`;
    vig.forEach(i=>{
      const r = crus[i.refIdx];
      const t = document.createElement("template"); t.innerHTML = cartaoDivida(id, i, "button");
      const b = t.content.firstElementChild;
      b.onclick = () => { aberta = { orig:r, d:copia(r) }; desenhar(); };
      caixa.appendChild(b);
    });
    // fixos por Pix: tocar abre o card de Gastos fixos, onde eles se editam
    pix.forEach(i=>{
      const t = document.createElement("template"); t.innerHTML = cartaoDivida(id, i, "button");
      const b = t.content.firstElementChild;
      b.onclick = () => { grupoAberto = "fixos"; editorMontado = null; renderEditor(); };
      caixa.appendChild(b);
    });

    box.querySelector(".fx-novo").onclick = () => {
      aberta = { orig:null, d:{ pessoa:"", nome:"", valor:0, parcelas:1, mesInicio:mes, pagos:"" } };
      desenhar();
    };
    box.querySelector(".fx-x").onclick = fechar;
  }

  function cartao(){
    const { orig, d } = aberta;
    const tituloDe = () => d.pessoa.trim() || d.nome.trim() || (orig ? "Sem nome" : "Novo registro");
    box.innerHTML = `<div class="fx-ed">
      ${topo(tituloDe(), "", !modoRapido)}
      <div class="erow dv-cab"></div>
      <div class="fx-secao">Parcelas</div>
      <div class="dv-parcelas"></div>
      <div class="fx-dica">O valor é o total: ele se divide pelas parcelas. Clique no status para marcar uma parcela como paga.</div>
      <div class="eacoes">
        <button class="btn" id="e-salvar">Salvar</button>
        <button class="btn ghost" id="e-voltar">${modoRapido?"Cancelar":"Voltar"}</button>
        ${orig?`<button class="btn ghost perigo" id="e-remover">Remover</button>`:""}
      </div></div>`;

    const titulo = box.querySelector(".fx-titulo");
    const pintarTitulo = () => { titulo.textContent = tituloDe(); };
    const cxParc = box.querySelector(".dv-parcelas");

    /** Uma linha por parcela: número · mês · valor · status (clicável). */
    function pintarParcelas(){
      const pagos = pagosDe(d);
      const ps = parcelasDoCartao(d);
      cxParc.innerHTML = "";
      if(!ps.length){ cxParc.innerHTML = `<div class="blank">Escolha a 1ª parcela.</div>`; return; }
      ps.forEach(p=>{
        const row = document.createElement("div");
        row.className = "dv-parc" + (p.comp===S.mesSel ? " atual" : "");
        const pago = pagos.has(p.comp);
        row.innerHTML = `<span class="n"></span><span class="m"></span><span class="v"></span>
          <button type="button" class="badge ${pago?"pago":"pendente"}" title="Alternar pago / pendente">${pago?"Pago":"Pendente"}</button>`;
        row.querySelector(".n").textContent = p.rot;
        row.querySelector(".m").innerHTML = rotuloFaturaHTML(p.comp);
        row.querySelector(".v").textContent = BRL.format(p.valor);
        row.querySelector("button").onclick = () => {
          d.pagos = alternarPago({pagos:d.pagos}, p.comp, !pago);
          pintarParcelas();
        };
        cxParc.appendChild(row);
      });
    }

    // ── campos do registro
    const cab = box.querySelector(".dv-cab");
    const pes = document.createElement("input");
    pes.placeholder = id==="devem" ? "nome da pessoa" : "pessoa ou empresa"; pes.value = d.pessoa;
    pes.addEventListener("input", ()=>{ d.pessoa = pes.value; pintarTitulo(); });
    const fPes = envolver(quem, pes); fPes.classList.add("dv-a-pes");

    const desc = document.createElement("input");
    desc.placeholder = "o que é"; desc.value = d.nome;
    desc.addEventListener("input", ()=>{ d.nome = desc.value; pintarTitulo(); });
    const fDesc = envolver("descrição", desc); fDesc.classList.add("dv-a-desc");

    const fV = envolver("valor total", campoMoeda(d.valor, v=>{ d.valor = v; pintarParcelas(); }));
    fV.classList.add("dv-a-v");

    const parc = document.createElement("select");
    parc.className = "parc";
    parc.innerHTML = `<option value="${INDETERMINADO}">Indeterminado</option>`
      + Array.from({length:MAX_PARCELAS}, (_,k)=>`<option value="${k+1}">${k+1}x</option>`).join("");
    parc.value = String(d.parcelas);
    parc.addEventListener("change", ()=>{ d.parcelas = Number(parc.value); pintarParcelas(); });
    const fParc = envolver("parcelas", parc); fParc.classList.add("dv-a-parc");

    const fIni = envolver("1ª parcela", campoCompetencia(d.mesInicio, v=>{
      // parcela paga é pelo número: se o início muda, os meses pagos andam junto
      if(v && d.mesInicio) d.pagos = moverPagos(d.pagos, d.mesInicio, v);
      d.mesInicio = v; pintarParcelas();
    }, false));
    fIni.classList.add("dv-a-ini");

    cab.append(fPes, fDesc, fV, fParc, fIni);
    pintarParcelas();

    const voltar = () => { if(modoRapido) return fechar(); aberta = null; desenhar(); };
    const vt = box.querySelector(".fx-voltar"); if(vt) vt.onclick = voltar;
    box.querySelector(".fx-x").onclick = fechar;
    $("e-voltar").onclick = voltar;

    $("e-salvar").onclick = () => {
      const dica = box.querySelector(".fx-dica");
      if(!d.pessoa.trim() && !d.nome.trim()){ pes.focus(); return; }
      if(!Number(d.valor)){
        dica.textContent = "Informe o valor."; dica.classList.add("erro"); return;
      }
      gravar(orig, d);
    };

    const rm = $("e-remover");
    if(rm) rm.onclick = () => {
      if(!confirm(`Remover “${nomeDe(orig)}” e todas as parcelas?`)) return;
      gravar(orig, null);
    };

    if(!orig) pes.focus();
  }

  desenhar();
}

/** Lançamentos do Caju numa competência, do mais recente ao mais antigo. */
const lancamentosCaju = mes => S.linhas
  .filter(x=>x.conta && x.conta.id==="caju" && daCompetencia(x, mes))
  .sort((a,b)=>(b.data?b.data.getTime():0)-(a.data?a.data.getTime():0));
const diaBR = d => d ? `${p2(d.getDate())}/${p2(d.getMonth()+1)}` : "—";
const isoDia = d => d ? `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}` : "";

/**
 * Editor do Caju, no mesmo card flutuante. O Caju só acrescenta (a
 * bronze dele não tem id para editar nem apagar), então:
 *
 * 1. Lista: o que já foi gasto na competência, só para conferir.
 * 2. Lançar: uma linha por compra (estabelecimento · valor · data),
 *    sempre com uma em branco no fim; a data da nova repete a anterior,
 *    já que as compras costumam ser lançadas em sequência.
 */
function editorCaju(g, box){
  // pelo "+" do celular: abre direto no lançamento; salvar fecha e avisa
  const modoRapido = rapido === g.id; rapido = null;
  let lancando = modoRapido;
  const desenhar = () => { box.scrollTop = 0; lancando ? form() : lista(); };
  const fechar = () => { grupoAberto = null; renderEditor(); };

  const topo = (titulo, mes, voltar) => `<div class="modal-topo">
      ${voltar?`<button type="button" class="modal-ic fx-voltar" title="Voltar para a lista" aria-label="Voltar">
        <svg class="ic" viewBox="0 0 24 24"><use href="#i-left"/></svg></button>`:""}
      <h3><span class="fx-titulo">${esc(titulo)}</span>${mes?` <span class="mes">${esc(mes)}</span>`:""}</h3>
      <button type="button" class="modal-ic fx-x" title="Fechar" aria-label="Fechar">×</button>
    </div>`;

  function lista(){
    const mes = S.mesSel;
    const ls = lancamentosCaju(mes);
    const gasto = soma(ls), teto = tetoCaju(mes);
    box.innerHTML = `<div class="fx-ed">
      ${topo("Caju", rotuloFatura(mes), false)}
      <div class="fx-itens cj-itens cd-lista"></div>
      <button type="button" class="fx-novo"><svg class="ic" viewBox="0 0 24 24"><use href="#i-plus"/></svg>Lançar gastos</button>
      ${caixasTotais([["gasto no mês", gasto], ...(teto ? [["disponível", teto-gasto, teto-gasto<0 ? "neg" : "livre"]] : [])])}
    </div>`;
    const caixa = box.querySelector(".cj-itens");
    if(!ls.length) caixa.innerHTML = `<div class="blank">Nada gasto no Caju nesta competência.</div>`;
    caixa.insertAdjacentHTML("beforeend", ls.map(l=>cartaoCaju(l)).join(""));
    box.querySelector(".fx-novo").onclick = () => { lancando = true; desenhar(); };
    box.querySelector(".fx-x").onclick = fechar;
  }

  function form(){
    const linhas = [];
    box.innerHTML = `<div class="fx-ed">
      ${topo("Lançar no Caju", "", !modoRapido)}
      <div class="cj-linhas"></div>
      <div class="esoma"><span>Total</span><span class="v"></span></div>
      <div class="fx-dica">Uma linha por compra, na ordem em que aconteceram. A data de cada nova linha repete a anterior.</div>
      <div class="eacoes">
        <button class="btn" id="e-salvar">Salvar</button>
        <button class="btn ghost" id="e-voltar">${modoRapido?"Cancelar":"Voltar"}</button>
      </div></div>`;
    const caixa = box.querySelector(".cj-linhas");
    const vazia = l => !String(l.nome).trim() && !Number(l.valor);
    const somar = () => { box.querySelector(".esoma .v").textContent =
      BRL.format(linhas.reduce((a,l)=>a+(Number(l.valor)||0),0)); };

    function montar(l){
      const row = document.createElement("div");
      row.className = "erow cj-linha";
      const nome = document.createElement("input");
      nome.placeholder = "onde"; nome.value = l.nome;
      nome.addEventListener("input", ()=>{ l.nome = nome.value; garantir(); });
      const fN = envolver("estabelecimento", nome); fN.classList.add("cj-a-n");
      const fV = envolver("valor", campoMoeda(l.valor, v=>{ l.valor = v; somar(); garantir(); }));
      fV.classList.add("cj-a-v");
      const dt = document.createElement("input");
      dt.type = "date"; dt.className = "dt"; dt.value = l.data;
      dt.addEventListener("input", ()=>{
        l.data = dt.value;
        // a linha em branco do fim acompanha a data da última preenchida
        const ult = linhas[linhas.length-1];
        if(ult !== l && vazia(ult) && ult._row){ ult.data = dt.value; ult._row.querySelector("input.dt").value = dt.value; }
      });
      const fD = envolver("data", dt); fD.classList.add("cj-a-d");
      const rm = document.createElement("button");
      rm.className = "rm cj-a-rm"; rm.type = "button"; rm.textContent = "×"; rm.title = "Tirar esta linha";
      rm.onclick = () => { const i = linhas.indexOf(l); if(i>=0) linhas.splice(i,1); row.remove(); somar(); garantir(); };
      row.append(fN, fV, fD, rm);
      caixa.appendChild(row);
      l._row = row;
    }
    /** Sempre uma linha em branco no fim (e só uma). */
    function garantir(){
      while(linhas.length>1 && vazia(linhas[linhas.length-1]) && vazia(linhas[linhas.length-2])){
        linhas.pop()._row.remove();
      }
      if(!linhas.length || !vazia(linhas[linhas.length-1])){
        const ant = linhas[linhas.length-1];
        const nova = { nome:"", valor:0, data: ant && ant.data ? ant.data : hojeISO() };
        linhas.push(nova); montar(nova);
      }
    }
    garantir(); somar();

    const voltar = () => { if(modoRapido) return fechar(); lancando = false; desenhar(); };
    const vt = box.querySelector(".fx-voltar"); if(vt) vt.onclick = voltar;
    box.querySelector(".fx-x").onclick = fechar;
    $("e-voltar").onclick = voltar;
    $("e-salvar").onclick = () => {
      const dica = box.querySelector(".fx-dica");
      const cheias = linhas.filter(l=>!vazia(l));
      const semNome = cheias.find(l=>!String(l.nome).trim());
      if(semNome){ semNome._row.querySelector("input").focus(); return; }
      const semValor = cheias.find(l=>!Number(l.valor));
      if(semValor){ dica.textContent = "Falta o valor de “"+semValor.nome.trim()+"”."; dica.classList.add("erro"); return; }
      if(!cheias.length){ voltar(); return; }
      salvarGrupo("caju2", cheias.map(l=>linhaPayload("caju2", { nome:l.nome.trim(), valor:l.valor, data:l.data || hojeISO() })));
      if(modoRapido){
        avisoLancado(`${BRL.format(cheias.reduce((a,l)=>a+(Number(l.valor)||0),0))} lançado no Caju`, "caju2");
        return;
      }
      // salvarGrupo fecha o editor; reabre na lista, já com o que foi lançado
      grupoAberto = "caju2";
      render();
    };
    linhas[0]._row.querySelector("input").focus();
  }

  desenhar();
}

