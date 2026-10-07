/* ═══════════ Card da compra ═══════════

   Tocar numa compra da lista abre o gerenciamento dela:
   - categoria: lista suspensa com as categorias traduzidas (CATEGORIAS),
     das que mais aparecem para as que menos, com busca
   - marcações: rolê (bronze.ritmo.tb_entertainment, como antes) e gasto
     fixo (automático, sim ou não)
   - divisão: cada pessoa vira um Me devem (bronze.ritmo.tb_receivables)
     com o id_transaction da compra

   Categoria e gasto fixo vão para bronze.ritmo.tb_transaction_details.
   Tudo é cruzado pelo id_transaction, com descrição + valor + dia de
   reserva para quando o Open Finance trocar o id. Salvar é otimista. */

function abrirCompra(l){
  if(!l || l.pendente) return;
  const autoCat = traduzirCategoria(l.categoriaOrig);
  const fixaAuto = (() => { const s = new Set(); for(const f of fixasVigentes(l.competencia)){ const c = cobrancaDaFixa(f, l.competencia); if(c) s.add(c.id); } return s.has(l.id); })();
  const antes = {
    categoria: l.categoria || autoCat,
    fixa: l.fixaManual,                       // null = automático
    role: ehRole(l),
    divisoes: divisoesDe(l).map(r => ({ id:String(r.id), pessoa:r.pessoa||"", valor:Number(r.valor)||0, pagos:r.pagos||"" }))
  };
  // estado do card (cópia): só vai para a tela e para o Databricks no Salvar
  const st = { categoria: antes.categoria, fixa: antes.fixa, role: antes.role,
               divisoes: antes.divisoes.map(d => ({...d})), comigo: true, abrirCat: false };

  const box = abrirModal(() => fecharModal());
  const dia = `${p2(l.data.getDate())}/${p2(l.data.getMonth()+1)}`;

  function desenhar(){
    const cats = categoriasPorUso();
    // categoria escolhida antes e que não está mais na lista continua aparecendo
    if(st.categoria && !cats.some(([c]) => c === st.categoria)) cats.push([st.categoria, 0]);
    const fixaEfetiva = st.fixa == null ? fixaAuto : st.fixa;
    const somaDiv = st.divisoes.reduce((a,d)=>a+(Number(d.valor)||0), 0);
    const minha = l.valor - somaDiv;

    box.innerHTML = `<div class="fx-ed cp-ed">
      <div class="modal-topo">
        <h3><span class="fx-titulo"></span> <span class="mes">${esc(dia)} · ${esc(BRL.format(l.valor))}</span></h3>
        <button type="button" class="modal-ic fx-x" title="Fechar" aria-label="Fechar">×</button>
      </div>
      <div class="cp-meta">${marca(l.conta, true)}<span>${esc(l.metodo)}${l.cartao?` · ${esc(l.cartao)}`:""}${
        l.parcela?` · parcela ${l.parcela.i}/${l.parcela.n}`:""}${l.hora?` · ${esc(l.hora)}`:""}</span></div>

      <div class="fx-secao">Categoria</div>
      <div class="cp-sel${st.abrirCat?" aberto":""}">
        <button type="button" class="cp-sel-bt" aria-haspopup="listbox" aria-expanded="${st.abrirCat}">
          <span class="cp-sel-v"></span><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron"/></svg></button>
        ${st.abrirCat?`<div class="cp-sel-pn">
          <input type="search" class="cp-busca" placeholder="Buscar categoria" aria-label="Buscar categoria" autocomplete="off">
          <div class="cp-sel-lista" role="listbox" aria-label="Categorias"></div></div>`:""}
      </div>
      ${l.categoriaOrig && l.categoriaOrig !== autoCat?`<div class="fx-dica">No banco: ${esc(l.categoriaOrig)}</div>`:""}

      <div class="fx-secao">Marcações</div>
      <button type="button" class="cp-tg${st.role?" on":""}" data-tg="role" role="switch" aria-checked="${st.role}">
        <span class="cp-tg-t"><b>Rolê</b><small>conta no total do rolê</small></span>
        <span class="ct-chave" aria-hidden="true"><i></i></span></button>
      <button type="button" class="cp-tg${fixaEfetiva?" on":""}" data-tg="fixa" role="switch" aria-checked="${fixaEfetiva}">
        <span class="cp-tg-t"><b>Gasto fixo</b><small>${st.fixa==null
          ? (fixaAuto ? "automático: casou com o cadastro de Gastos fixos" : "automático: não casou com nenhuma conta fixa")
          : "marcado à mão"}</small></span>
        <span class="ct-chave" aria-hidden="true"><i></i></span></button>
      ${st.fixa!=null?`<button type="button" class="link-btn cp-auto">voltar ao automático</button>`:""}

      <div class="fx-secao">Divisão</div>
      <div class="cp-divs"></div>
      <div class="cp-div-acoes">
        <button type="button" class="fx-add cp-pessoa"><svg class="ic" viewBox="0 0 24 24"><use href="#i-plus"/></svg>pessoa</button>
        ${st.divisoes.length?`<button type="button" class="fx-add cp-igual">dividir igual</button>
        <label class="cp-comigo"><input type="checkbox"${st.comigo?" checked":""}> contar comigo</label>`:""}
      </div>
      ${st.divisoes.length?`<div class="esoma sub"><span>Sua parte</span><span class="p${minha<0?" neg":""}">${esc(BRL.format(minha))}</span></div>
      <div class="fx-dica">Cada pessoa vira um registro em Me devem, na fatura de ${esc(rotuloFatura(l.competencia))}.</div>`:""}

      <div class="eacoes">
        <button class="btn" id="cp-salvar">Salvar</button>
        <button class="btn ghost" id="cp-cancelar">Cancelar</button>
      </div>
    </div>`;

    box.querySelector(".fx-titulo").textContent = l.desc || "Compra";
    box.querySelector(".fx-x").onclick = fecharModal;
    box.querySelector("#cp-cancelar").onclick = fecharModal;
    box.querySelector("#cp-salvar").onclick = salvar;

    // ── lista suspensa de categorias, com busca
    box.querySelector(".cp-sel-v").textContent = st.categoria || SEM_CATEGORIA;
    box.querySelector(".cp-sel-bt").onclick = () => { st.abrirCat = !st.abrirCat; desenhar(); if(st.abrirCat) box.querySelector(".cp-busca").focus(); };
    const busca = box.querySelector(".cp-busca");
    if(busca){
      const lista = box.querySelector(".cp-sel-lista");
      const escolher = c => { st.categoria = c; st.abrirCat = false; desenhar(); box.querySelector(".cp-sel-bt").focus(); };
      const pintar = () => {
        const termo = semAcento(busca.value);
        const vis = cats.filter(([c]) => !termo || semAcento(c).includes(termo));
        lista.innerHTML = vis.length ? vis.map(([c, n]) => `<button type="button" class="cp-op${c===st.categoria?" on":""}" role="option" aria-selected="${c===st.categoria}">
            <span></span><small>${n ? n : ""}</small></button>`).join("")
          : `<div class="fx-dica">Nenhuma categoria com “${esc(busca.value)}”.</div>`;
        lista.querySelectorAll(".cp-op").forEach((b, k) => {
          b.firstElementChild.textContent = vis[k][0];
          b.title = vis[k][1] ? `${vis[k][1]} compra${vis[k][1]>1?"s":""}` : "nenhuma compra ainda";
          b.onclick = () => escolher(vis[k][0]);
          b.onkeydown = e => {
            if(e.key === "ArrowDown"){ e.preventDefault(); (b.nextElementSibling || b).focus(); }
            if(e.key === "ArrowUp"){ e.preventDefault(); (b.previousElementSibling || busca).focus(); }
            if(e.key === "Escape"){ e.stopPropagation(); st.abrirCat = false; desenhar(); }
          };
        });
        return vis;
      };
      pintar();
      busca.oninput = pintar;
      busca.onkeydown = e => {
        if(e.key === "Enter"){ e.preventDefault(); const vis = pintar(); if(vis.length) escolher(vis[0][0]); }
        if(e.key === "ArrowDown"){ e.preventDefault(); const p = lista.querySelector(".cp-op"); if(p) p.focus(); }
        if(e.key === "Escape"){ e.stopPropagation(); st.abrirCat = false; desenhar(); }
      };
      const atual = lista.querySelector(".cp-op.on");
      if(atual) atual.scrollIntoView({ block:"nearest" });
    }

    box.querySelector('[data-tg="role"]').onclick = () => { st.role = !st.role; desenhar(); };
    box.querySelector('[data-tg="fixa"]').onclick = () => { st.fixa = !fixaEfetiva; desenhar(); };
    const auto = box.querySelector(".cp-auto");
    if(auto) auto.onclick = () => { st.fixa = null; desenhar(); };

    // ── divisão: uma linha por pessoa
    const caixa = box.querySelector(".cp-divs");
    st.divisoes.forEach((d, k) => {
      const row = document.createElement("div");
      row.className = "erow cp-div";
      const nome = document.createElement("input");
      nome.placeholder = "Nome"; nome.value = d.pessoa; nome.maxLength = 60;
      nome.addEventListener("input", () => { d.pessoa = nome.value; });
      const valor = campoMoeda(d.valor, v => { d.valor = v; pintarParte(); });
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "modal-ic cp-rm"; rm.title = "Tirar da divisão"; rm.setAttribute("aria-label", "Tirar da divisão"); rm.textContent = "×";
      rm.onclick = () => { st.divisoes.splice(k, 1); desenhar(); };
      row.append(envolver("pessoa", nome), envolver("valor", valor), rm);
      if(d.pagos) { const tg = document.createElement("span"); tg.className = "tag cp-pago"; tg.textContent = "pago"; row.appendChild(tg); }
      caixa.appendChild(row);
    });
    if(!st.divisoes.length) caixa.innerHTML = `<div class="fx-dica">Ninguém na divisão. Use “pessoa” para dividir esta compra.</div>`;

    box.querySelector(".cp-pessoa").onclick = () => {
      st.divisoes.push({ id:"", pessoa:"", valor:0, pagos:"" });
      igual(); desenhar();
      const ns = box.querySelectorAll(".cp-div input:not(.num)"); if(ns.length) ns[ns.length-1].focus();
    };
    const bIgual = box.querySelector(".cp-igual");
    if(bIgual) bIgual.onclick = () => { igual(); desenhar(); };
    const comigo = box.querySelector(".cp-comigo input");
    if(comigo) comigo.onchange = () => { st.comigo = comigo.checked; igual(); desenhar(); };

    function pintarParte(){
      const p = box.querySelector(".esoma.sub .p");
      if(!p) return;
      const m = l.valor - st.divisoes.reduce((a,d)=>a+(Number(d.valor)||0), 0);
      p.textContent = BRL.format(m); p.classList.toggle("neg", m < 0);
    }
  }

  /** Partes iguais entre as pessoas (e eu, se "contar comigo"); os centavos que sobram ficam comigo. */
  function igual(){
    const n = st.divisoes.length + (st.comigo ? 1 : 0);
    if(!n) return;
    const parte = Math.floor(l.valor * 100 / n) / 100;
    st.divisoes.forEach(d => { d.valor = parte; });
    if(!st.comigo && st.divisoes.length){
      // sem mim, a última pessoa absorve a sobra para a soma fechar
      st.divisoes[st.divisoes.length-1].valor = Math.round((l.valor - parte * (st.divisoes.length-1)) * 100) / 100;
    }
  }

  async function salvar(){
    const base = { id_transaction: l.id || null, nm_merchant: l.desc, vl_amount: l.valor, dt_transaction: diaISO(l.data) };
    const chamadas = [];

    // 1. categoria / gasto fixo da compra
    const cat = st.categoria;
    if(cat !== antes.categoria || st.fixa !== antes.fixa){
      const det = { id: l.id || "", chave: chaveRole(l), categoria: cat === autoCat ? "" : cat,
                    fixa: st.fixa, ts: new Date().toISOString() };
      S.reg.detalhes = (S.reg.detalhes || []).concat(det);
      chamadas.push(["detalhes", [{ ...base, nm_category: det.categoria || null, fl_fixed_expense: st.fixa }]]);
    }

    // 2. rolê: mesmo caminho do extrato (tb_entertainment)
    if(st.role !== antes.role){
      const k = chaveRole(l);
      if(st.role){ S.roles.add(k); S.rolesFora.delete(k); } else { S.roles.delete(k); S.rolesFora.add(k); }
      if(S.rolesMudados.has(k)){ if(S.rolesMudados.get(k) === st.role) S.rolesMudados.delete(k); }
      else S.rolesMudados.set(k, !st.role);
      S.rolesSujo = S.rolesMudados.size > 0;
    }

    // 3. divisão: cria, altera e desfaz Me devem
    const devem = S.reg.devem = (S.reg.devem || []);
    const linhasDevem = [];
    const ficam = new Set();
    for(const d of st.divisoes){
      const pessoa = d.pessoa.trim(), valor = Math.round((Number(d.valor)||0)*100)/100;
      if(!pessoa || valor <= 0) continue;
      if(d.id){
        ficam.add(d.id);
        const r = devem.find(x => String(x.id) === d.id);
        const a = antes.divisoes.find(x => x.id === d.id);
        if(r && a && (a.pessoa !== pessoa || a.valor !== valor)){
          r.pessoa = pessoa; r.valor = valor;
          linhasDevem.push(paraBronze("devem", r));
        }
      } else {
        const r = { id: novoId(), mes: l.competencia, mesInicio: l.competencia, pessoa, nome: l.desc,
                    valor, parcelas: 1, pagos: "", transacao: l.id, pago: false, terceiro: false, data: "" };
        devem.push(r);
        linhasDevem.push(paraBronze("devem", r));
      }
    }
    for(const a of antes.divisoes){
      if(ficam.has(a.id)) continue;
      const k = devem.findIndex(x => String(x.id) === a.id);
      if(k >= 0){ linhasDevem.push(paraBronze("devem", devem[k], true)); devem.splice(k, 1); }
    }
    if(linhasDevem.length) chamadas.push(["devem", linhasDevem]);

    // otimista: a tela muda já; o Databricks grava em segundo plano
    fecharModal();
    recompor(); render();
    if(st.role !== antes.role) salvarRoles();
    try{
      for(const [op, linhas] of chamadas) await api("/salvar", { op, linhas });
    }catch(e){
      banner("err", `Não consegui gravar a compra no Databricks: ${esc(e.message)}`);
    }
  }

  desenhar();
}
