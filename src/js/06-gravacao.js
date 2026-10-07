/* ═══════════ gravação no Databricks ═══════════

   A bronze só recebe linhas novas: editar grava uma versão nova do
   registro (mesmo id) e remover grava uma versão com fl_deleted = true.
   A silver fica com a versão mais recente de cada id.

   Tudo é otimista: a tela muda na hora e a gravação vai em segundo
   plano. Só aparece aviso se ela falhar. */

/** Operação do Worker para cada quadro. */
const OP_DE = { devem:"devem", devo:"devo", fixos:"fixos", entradas:"entradas", caju2:"caju" };

/** Id novo para um registro criado aqui (a bronze versiona por ele). */
function novoId(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

/** O que identifica um registro: o id; nas Entradas, a competência. */
const chaveReg = (id, r) => id==="entradas" ? compDe(r.competencia) : String(r.id||"");

/**
 * Parcelas pagas são guardadas pelo NÚMERO (1, 2, 3…), não pelo mês:
 * assim mudar o mês de início não desmarca nada. O HTML trabalha com
 * os meses; quando o início muda, os meses pagos andam junto.
 */
function moverPagos(pagos, de, para){
  const d = distMeses(de, para);
  if(!d || !de || !para) return String(pagos||"");
  return [...pagosDe({pagos})].map(m=>somaMeses(m, d)).filter(Boolean).sort().join(";");
}
function numerosPagos(r){
  const ini = inicioDe(r), { n, indet } = parcelasDe(r);
  return [...pagosDe(r)].map(m=>distMeses(ini, m)+1)
    .filter(k=>Number.isInteger(k) && k>=1 && (indet || k<=n))
    .sort((a,b)=>a-b);
}

/** Registro da tela (S.reg) → linha da bronze. */
function paraBronze(id, r, apagado){
  const del = { fl_deleted: !!apagado };
  if(id==="devem" || id==="devo"){
    const p = parcelasDe(r);
    return { [id==="devem"?"id_receivable":"id_payable"]: r.id,
      dt_start_month: inicioDe(r), nm_person: r.pessoa||"", nm_item: r.nome||"",
      vl_amount: Number(r.valor)||0, qt_installments: p.indet ? 0 : p.n,
      ls_paid_installments: numerosPagos(r),
      ...(id==="devem" ? { id_transaction: r.transacao || null } : {}), ...del };
  }
  if(id==="fixos") return {
    id_fixed_expense: r.id, nm_invoice: r.nome, nm_alias: r.apelido||"",
    vl_amount: Number(r.valor)||0, nr_day: r.data||null, fl_third_party: !!r.terceiro,
    dt_start_month: compDe(r.inicio)||null, dt_end_month: compDe(r.fim)||null,
    nm_billing: cobrancaFixa(r), ...del };
  if(id==="entradas") return {
    dt_competence: compDe(r.competencia), vl_part1: Number(r.parte1)||0, vl_part2: Number(r.parte2)||0,
    vl_caju: Number(r.caju)||0, vl_additions: Number(r.acrescimos)||0,
    vl_deductions: Math.abs(Number(r.descontos)||0), ...del };
  if(id==="caju2") return {
    nm_merchant: String(r.nome||"").trim(), vl_amount: Number(r.valor)||0,
    dt_transaction: String(r.data||"").slice(0,10) };
  return null;
}
const assinatura = (id, r) => JSON.stringify(paraBronze(id, r, false));

/** Linha do formulário (linhaPayload) → registro no formato de S.reg. */
function paraRegistro(id, it, mes, antigo){
  if(id==="devem" || id==="devo"){
    const ini = compDe(it.mesInicio) || mes;
    let pagos = String(it.pagos||"");
    if(antigo && inicioDe(antigo) !== ini) pagos = moverPagos(pagos, inicioDe(antigo), ini);
    return { id: it.id || novoId(), mes: ini, mesInicio: ini,
      pessoa: String(it.pessoa||"").trim(), nome: String(it.nome||"").trim(),
      valor: Number(it.valor)||0, parcelas: it.parcelas, pagos,
      // Me devem que veio da divisão de uma compra continua ligado a ela
      transacao: (antigo && antigo.transacao) || "",
      pago: false, terceiro: false, data: "" };
  }
  if(id==="fixos") return { id: it.id || novoId(), mes:"*",
    nome: String(it.nome||"").trim(), apelido: String(it.apelido||"").trim(),
    valor: Number(it.valor)||0, data: String(it.data||""), terceiro: !!it.terceiro,
    inicio: compDe(it.inicio), fim: compDe(it.fim), cobranca: it.cobranca==="pix" ? "pix" : "picpay" };
  if(id==="caju2"){
    const dia = String(it.data||"").slice(0,10);
    return { nome: String(it.nome||"").trim(), valor: Number(it.valor)||0, data: dia, mes: compDe(dia) };
  }
  return { ...it };
}

/**
 * Troca `antigos` por `novos` em S.reg, redesenha na hora e grava em
 * segundo plano só o que mudou: registro novo ou alterado vira uma linha
 * nova; o que sumiu da lista vira uma linha com fl_deleted.
 */
async function sincronizar(id, antigos, novos){
  const chave = chavePlanilha(id);
  const k = r => chaveReg(id, r);

  // mesma chave duas vezes (ex.: dois meses iguais nas Entradas): vale a última
  const unicos = [...new Map(novos.filter(k).map(n=>[k(n), n])).values()];

  const porChave = new Map(antigos.map(a=>[k(a), a]));
  const mudados = unicos.filter(n => !porChave.has(k(n)) || assinatura(id, porChave.get(k(n))) !== assinatura(id, n));
  const ficam = new Set(unicos.map(k));
  const removidos = antigos.filter(a => k(a) && !ficam.has(k(a)));

  const sai = new Set(antigos);
  S.reg[chave] = (S.reg[chave]||[]).filter(i=>!sai.has(i)).concat(unicos);
  grupoAberto = null; S.editando = null; S.salvando = false;
  recompor(); render();

  const linhas = mudados.map(r=>paraBronze(id, r, false))
    .concat(removidos.map(r=>paraBronze(id, r, true))).filter(Boolean);
  if(!linhas.length) return;
  try{
    await api("/salvar", { op: OP_DE[id], linhas });
  }catch(e){
    banner("err", `Não consegui gravar no Databricks: ${esc(e.message)} `
      + `O que está na tela ainda não foi salvo — recarregue para ver o que ficou gravado.`);
  }
}

/**
 * Grava um quadro a partir do formulário. `itens` é a lista completa
 * daquele escopo (o mês, ou tudo nos quadros de todo mês) no formato do
 * linhaPayload; o que estava no escopo e não veio é removido. O Caju só
 * acrescenta.
 */
async function salvarGrupo(id, itens, mesAlvo){
  const g = grupoDe(id);
  const mes = mesAlvo || S.mesSel;
  const lista = S.reg[chavePlanilha(id)] || [];
  const antigos = g.soAdiciona ? [] : lista.filter(i => g.todosOsMeses || i.mes===mes);
  const porId = new Map(antigos.map(a=>[String(a.id||""), a]));
  const novos = itens.map(it => paraRegistro(id, it, mes, porId.get(String(it.id||""))));
  if(g.soAdiciona){
    // sem chave de versão: cada compra lançada é uma linha só
    S.reg[chavePlanilha(id)] = lista.concat(novos);
    grupoAberto = null; S.salvando = false;
    recompor(); render();
    if(!novos.length) return;
    try{ await api("/salvar", { op: OP_DE[id], linhas: novos.map(r=>paraBronze(id, r)) }); }
    catch(e){ banner("err", `Não consegui gravar no Databricks: ${esc(e.message)}`); }
    return;
  }
  return sincronizar(id, antigos, novos);
}

/** Chave de conteúdo de um lançamento anotado: nome|valor|data. */
function chaveDe(item){
  return String(item.nome||"").trim()
    + "|" + (Number(item.valor)||0).toFixed(2)
    + "|" + String(item.data||"").slice(0,10);
}

/** O id que viaja no formulário: o do próprio registro, quando existe. */
function idPlanilha(grupoId, item){
  return String(item.id||"").trim();
}

/**
 * Competência em dois seletores: mês e ano.
 *
 * O <input type="month"> nativo mostra "setembro de 2026" numa caixa
 * apertada, corta o ano e obriga a abrir um calendário para trocar de
 * mês. Dois selects dizem o mesmo em menos espaço e sem calendário.
 */
function campoCompetencia(valor, aoMudar, opcional){
  const caixa=document.createElement("span");
  caixa.className="comp";

  const [ano0, mes0] = String(valor||"").split("-");
  const hoje = TODAY.getFullYear();
  const anos = [];
  for(let a=hoje-3; a<=hoje+5; a++) anos.push(a);
  if(ano0 && !anos.includes(Number(ano0))) anos.push(Number(ano0));
  anos.sort();

  const selMes=document.createElement("select");
  selMes.className="cmes";
  selMes.innerHTML = (opcional?`<option value="">—</option>`:"")
    + MES_L.map((m,i)=>`<option value="${p2(i+1)}">${m.charAt(0).toUpperCase()+m.slice(1)}</option>`).join("");
  const selAno=document.createElement("select");
  selAno.className="cano";
  selAno.innerHTML = (opcional?`<option value="">—</option>`:"")
    + anos.map(a=>`<option value="${a}">${a}</option>`).join("");

  selMes.value = mes0 || (opcional ? "" : p2(TODAY.getMonth()+1));
  selAno.value = ano0 || (opcional ? "" : String(hoje));

  const avisar = () => {
    const m=selMes.value, a=selAno.value;
    // só vale como competência quando os dois estão escolhidos
    aoMudar(m && a ? `${a}-${m}` : "");
  };
  selMes.addEventListener("change", avisar);
  selAno.addEventListener("change", avisar);

  caixa.appendChild(selMes); caixa.appendChild(selAno);
  return caixa;
}

/**
 * Campo com uma etiqueta curta em cima. A largura vem da classe do
 * próprio campo, para não repetir em cada chamada nem deixar o
 * invólucro esticar sozinho.
 */
function envolver(rotulo, campo){
  // por classList, não por className: um campo com classe extra
  // ("num neg") deixava de casar e o invólucro esticava pela linha
  const achado = ["num","dt","parc","dia","comp","status","pes","cob"].find(c=>campo.classList.contains(c));
  const tipo = achado ? "f-"+achado
    : (campo.type==="checkbox" ? "f-chk" : "f-txt");
  const w=document.createElement("span");
  w.className="efield "+tipo;
  const t=document.createElement("span");
  t.className="tagx"; t.textContent=rotulo;
  w.appendChild(t); w.appendChild(campo);
  return w;
}

/**
 * Reordenar por arrasto.
 *
 * Move o nó no DOM e o item no array ao mesmo tempo: se só o DOM
 * mudasse, a ordem da tela e a que vai para a planilha divergiriam no
 * próximo save. O arrasto só liga ao segurar a alça, senão selecionar
 * texto dentro dos campos viraria arrasto.
 */
function arrastavel(el, alca, item, itens, caixa){
  alca.addEventListener("mousedown", ()=>{ el.draggable = true; });
  alca.addEventListener("touchstart", ()=>{ el.draggable = true; }, {passive:true});

  el.addEventListener("dragstart", e=>{
    el.classList.add("arrastando");
    e.dataTransfer.effectAllowed = "move";
    try{ e.dataTransfer.setData("text/plain", ""); }catch(_){}
    caixa._arrasto = { el, item, itens };
  });
  el.addEventListener("dragend", ()=>{
    el.draggable = false;
    el.classList.remove("arrastando");
    caixa.querySelectorAll(".alvo").forEach(n=>n.classList.remove("alvo"));
    caixa._arrasto = null;
  });
  el.addEventListener("dragleave", ()=> el.classList.remove("alvo"));
  el.addEventListener("dragover", e=>{
    const a = caixa._arrasto;
    if(!a || a.itens !== itens || a.el === el) return;   // só dentro da mesma lista
    e.preventDefault();
    el.classList.add("alvo");
    const r = el.getBoundingClientRect();
    const depois = e.clientY > r.top + r.height/2;
    caixa.insertBefore(a.el, depois ? el.nextSibling : el);

    const de = itens.indexOf(a.item);
    if(de>=0) itens.splice(de, 1);
    const ref = itens.indexOf(item);
    itens.splice(ref<0 ? itens.length : (depois ? ref+1 : ref), 0, a.item);
  });
  el.addEventListener("drop", e=>{ e.preventDefault(); el.classList.remove("alvo"); });
}

/** Alça de arrasto. */
function criarAlca(titulo){
  const a=document.createElement("span");
  a.className="grip"; a.title=titulo||"Arrastar para reordenar";
  a.innerHTML=`<svg class="ic" viewBox="0 0 24 24"><use href="#i-grip"/></svg>`;
  return a;
}

/**
 * Despesas fixas no formato do editor: uma por nome de exibição, com
 * os quatro campos da despesa (exibir como, cobrado em, de terceiro, na
 * fatura) e as faixas de valor (valor, dia, início).
 *
 * Uma faixa vale do início até a véspera da faixa seguinte, então o
 * editor não tem "término". Encerrar é uma faixa com valor 0 a partir
 * do mês em que a conta parou. Registro antigo que tem `fim` sem outra
 * faixa logo depois vira essa faixa de valor 0 aqui.
 */
function despesasFixas(){
  const grupos = new Map();
  for(const i of itensGrupo("fixos")){
    const k = chaveFixa(i);
    if(!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(i);
  }
  return [...grupos.values()].map(linhas=>{
    linhas.sort((a,b)=>compDe(a.inicio).localeCompare(compDe(b.inicio)));
    const ult = linhas[linhas.length-1];
    const faixas = [];
    linhas.forEach((r,n)=>{
      faixas.push({ id:String(r.id||""), valor:Number(r.valor)||0, dia:String(r.data||""), inicio:compDe(r.inicio) });
      const fim = compDe(r.fim), prox = linhas[n+1];
      if(fim && (!prox || compDe(prox.inicio) > somaMeses(fim, 1)))
        faixas.push({ id:"", valor:0, dia:"", inicio:somaMeses(fim, 1) });
    });
    return { chave:chaveFixa(ult), apelido:String(ult.apelido||ult.nome||""), nome:String(ult.nome||""),
             cobranca:cobrancaFixa(ult), terceiro:!!ult.terceiro, faixas };
  }).sort((a,b)=>a.apelido.localeCompare(b.apelido, "pt-BR"));
}

/** Faixa que vale numa competência: a de início mais recente até ela. */
function faixaDaDespesa(d, mes){
  return d.faixas.filter(f=>!f._branca && (!f.inicio || f.inicio <= mes))
    .sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio))).pop() || null;
}
const despesaVigente = (d, mes) => { const f = faixaDaDespesa(d, mes); return !!(f && Number(f.valor)); };

/** Por que uma despesa está fora da competência: ainda não começou ou já parou. */
function foraDeVigencia(d, mes){
  const ord = d.faixas.filter(f=>!f._branca).sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
  const proxima = ord.find(f=>f.inicio > mes && Number(f.valor));
  if(proxima && !faixaDaDespesa(d, mes)) return `começa em ${mesCurto(proxima.inicio)}`;
  const f = faixaDaDespesa(d, mes);
  if(f && !Number(f.valor)) return proxima ? `pausada · volta em ${mesCurto(proxima.inicio)}`
                                           : `encerrada em ${mesCurto(somaMeses(f.inicio, -1))}`;
  return "sem valor";
}

/**
 * Lista das descrições que já apareceram nas faturas, de todos os meses,
 * para escolher o "na fatura" de uma conta fixa. Escolha múltipla: cada
 * toque marca ou desmarca, e a lista só fecha no Concluir (ou fora dela).
 * Um texto que não está na lista pode ser incluído assim mesmo.
 */
function abrirListaFatura(campo, escolhidos, aoMudar){
  const mapa = new Map();
  for(const l of S.consolidado){
    const k = String(l.desc||"").trim();
    if(!k) continue;
    const e = mapa.get(k) || { n:0, data:null, valor:0 };
    e.n++;
    if(!e.data || l.data > e.data){ e.data = l.data; e.valor = l.valor; }
    mapa.set(k, e);
  }
  const todas = [...mapa.entries()].sort((a,b)=>a[0].localeCompare(b[0], "pt-BR"));
  const marcados = new Set(escolhidos);

  const veu = document.createElement("div"); veu.className = "dl-veu";
  const lista = document.createElement("div");
  lista.className = "dl-lista fx-picker"; lista.setAttribute("role","listbox");
  lista.setAttribute("aria-multiselectable","true");
  lista.innerHTML = `<div class="dl-titulo">Na fatura · ${todas.length} descrições</div>`;
  const busca = document.createElement("input");
  busca.className = "dl-busca"; busca.placeholder = "buscar";
  const ops = document.createElement("div"); ops.className = "dl-ops";
  const pe = document.createElement("div"); pe.className = "dl-pe";
  const ok = document.createElement("button"); ok.type = "button"; ok.className = "btn";
  pe.appendChild(ok);
  lista.append(busca, ops, pe);

  const check = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>';
  const fechar = () => { veu.remove(); lista.remove(); document.removeEventListener("keydown", tecla); };
  const tecla = e => { if(e.key==="Escape"){ e.stopPropagation(); fechar(); } };
  const avisar = () => { ok.textContent = marcados.size ? `Concluir · ${marcados.size}` : "Concluir"; aoMudar([...marcados]); };

  const opcao = (k, sub) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "dl-op";
    b.setAttribute("role","option");
    const pinta = () => {
      b.setAttribute("aria-selected", String(marcados.has(k)));
      b.innerHTML = `<span><b></b>${sub?"<small></small>":""}</span>${marcados.has(k)?check:""}`;
      b.querySelector("b").textContent = k;
      if(sub) b.querySelector("small").textContent = sub;
    };
    pinta();
    b.onclick = () => { marcados.has(k) ? marcados.delete(k) : marcados.add(k); pinta(); avisar(); };
    return b;
  };

  const pintar = () => {
    const q = norm(busca.value).trim();
    ops.innerHTML = "";
    const txt = busca.value.trim();
    if(txt && !mapa.has(txt) && !marcados.has(txt)){
      const b = document.createElement("button"); b.type = "button"; b.className = "dl-op";
      b.innerHTML = `<span></span>`; b.firstChild.textContent = `Incluir “${txt}”`;
      b.onclick = () => { marcados.add(txt); busca.value = ""; pintar(); avisar(); };
      ops.appendChild(b);
    }
    // os já escolhidos que não vieram de fatura nenhuma aparecem no topo
    [...marcados].filter(k=>!mapa.has(k) && (!q || norm(k).includes(q)))
      .forEach(k=>ops.appendChild(opcao(k, "incluído à mão")));
    (q ? todas.filter(([k])=>norm(k).includes(q)) : todas).slice(0, 300).forEach(([k,e])=>
      ops.appendChild(opcao(k,
        `${BRL.format(e.valor)} · ${p2(e.data.getDate())}/${p2(e.data.getMonth()+1)}/${String(e.data.getFullYear()).slice(2)} · ${e.n}×`)));
    if(!ops.children.length) ops.innerHTML = `<div class="blank">Nada encontrado.</div>`;
  };

  // abaixo do campo; se não couber, acima. No celular ocupa a largura toda.
  const r = campo.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, m = 8;
  const larg = Math.min(vw - 2*m, Math.max(r.width, 340));
  const x = Math.min(Math.max(m, r.left), vw - m - larg);
  const embaixo = vh - r.bottom - m - 6, emcima = r.top - m - 6;
  const acima = embaixo < 300 && emcima > embaixo;
  Object.assign(lista.style, { left:x+"px", width:larg+"px", maxHeight:Math.min(460, acima ? emcima : embaixo)+"px" });
  if(acima){ lista.classList.add("acima"); lista.style.bottom = (vh - r.top + 6)+"px"; }
  else lista.style.top = (r.bottom + 6)+"px";

  veu.addEventListener("click", fechar);
  ok.onclick = fechar;
  busca.addEventListener("input", pintar);
  document.addEventListener("keydown", tecla);
  document.body.append(veu, lista);
  avisar(); pintar();
  busca.focus();
}

