/* ═══════════ Card da compra ═══════════

   Tocar numa compra da lista abre o gerenciamento dela:
   - no topo, a compra (valor grande) e três botões de um toque:
     categoria (abre a lista com busca, das mais usadas para as menos),
     rolê e gasto fixo
   - rolê grava na bronze.ritmo.tb_entertainment, como antes; gasto fixo
     é automático, sim ou não
   - divisão: cada pessoa vira um Me devem (bronze.ritmo.tb_receivables)
     com o id_transaction da compra; o card mostra o que já voltou e o
     que falta, e “em aberto”/“pago” marca a parcela do Me devem

   Categoria e gasto fixo vão para bronze.ritmo.tb_transaction_details.
   Tudo é cruzado pelo id_transaction, com descrição + valor + dia de
   reserva para quando o Open Finance trocar o id. Salvar é otimista. */

/** "🛒 Mercado" → ["🛒", "Mercado"]; sem emoji → ["", nome]. */
function partesCategoria(c){
  const m = String(c||"").match(/^(\S+)\s+(.+)$/);
  return (m && !/[\p{L}\p{N}]/u.test(m[1])) ? [m[1], m[2]] : ["", String(c||"")];
}

function abrirCompra(l){
  if(!l || l.pendente) return;
  const autoCat = traduzirCategoria(l.categoriaOrig);
  const fixaAuto = (() => { const s = new Set(); for(const f of fixasVigentes(l.competencia)){ const c = cobrancaDaFixa(f, l.competencia); if(c) s.add(c.id); } return s.has(l.id); })();
  const antes = {
    categoria: l.categoria || autoCat,
    fixa: l.fixaManual,                       // null = automático
    role: ehRole(l),
    divisoes: divisoesDe(l).map(r => ({ id:String(r.id), pessoa:r.pessoa||"", valor:Number(r.valor)||0,
                                        pagos:r.pagos||"", pago: !!String(r.pagos||"").trim() }))
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
    const [catEmoji, catNome] = partesCategoria(st.categoria || SEM_CATEGORIA);
    const [reais, cents] = BRL.format(l.valor).split(",");
    const temDiv = st.divisoes.length > 0;

    box.innerHTML = `<div class="fx-ed cp-ed">
      <div class="cp-hero">
        <div class="cp-hero-l1">${marca(l.conta, true)}<span>${esc(l.metodo)} · ${esc(dia)}${l.hora?` · ${esc(l.hora)}`:""}${
          l.parcela?` · parcela ${l.parcela.i}/${l.parcela.n}`:""}</span>
          <button type="button" class="modal-ic fx-x" title="Fechar" aria-label="Fechar">×</button></div>
        <h3 class="cp-nome"></h3>
        <div class="cp-valor">${esc(reais)}<small>,${esc(cents||"00")}</small></div>
      </div>

      <div class="cp-acoes">
        <button type="button" class="cp-ac cp-ac-cat${st.abrirCat?" aberto":""}" aria-haspopup="listbox" aria-expanded="${st.abrirCat}"
          title="Trocar a categoria"><em></em><span class="cp-ac-lin"><span class="cp-ac-t"></span><svg class="cp-ac-seta" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron"/></svg></span></button>
        <button type="button" class="cp-ac${st.role?" on":""}" data-tg="role" role="switch" aria-checked="${st.role}"
          title="Conta no total do rolê"><em>🎉</em><span class="cp-ac-t">Rolê</span></button>
        <button type="button" class="cp-ac${fixaEfetiva?" on":""}" data-tg="fixa" role="switch" aria-checked="${fixaEfetiva}"
          title="${st.fixa==null ? (fixaAuto ? "Automático: casou com o cadastro de Gastos fixos" : "Automático: não casou com nenhuma conta fixa") : "Marcado à mão"}">
          <em>📌</em><span class="cp-ac-t">Gasto fixo</span><small>${st.fixa==null ? "automático" : "à mão"}</small></button>
      </div>
      ${st.fixa!=null?`<button type="button" class="link-btn cp-auto">gasto fixo: voltar ao automático</button>`:""}
      ${st.abrirCat?`<div class="cp-sel-pn">
          <input type="search" class="cp-busca" placeholder="Buscar categoria" aria-label="Buscar categoria" autocomplete="off">
          <div class="cp-sel-lista" role="listbox" aria-label="Categorias"></div></div>
        ${l.categoriaOrig && l.categoriaOrig !== autoCat?`<div class="fx-dica">No banco: ${esc(l.categoriaOrig)}</div>`:""}`:""}

      <div class="fx-secao cp-div-tit"><span>Divisão${temDiv?` · ${st.divisoes.length+1} partes`:""}</span>${temDiv?`
        <span class="cp-div-ops"><button type="button" class="link-btn cp-igual">dividir igual</button>
        <label class="cp-comigo"><input type="checkbox"${st.comigo?" checked":""}> contar comigo</label></span>`:""}</div>
      ${temDiv?`<div class="cp-voltou">
          <div><span>Já voltou</span><b class="cp-ja"></b></div>
          <div class="dir"><span>Falta</span><b class="cp-falta"></b></div>
        </div>
        <div class="cp-barra" aria-hidden="true"></div>
        <div class="cp-leg"><span><i class="eu"></i>sua parte</span><span><i class="pg"></i>pago</span><span><i class="ab"></i>em aberto</span></div>`:""}
      <div class="cp-pess"></div>
      <button type="button" class="fx-add cp-pessoa"><svg class="ic" viewBox="0 0 24 24"><use href="#i-plus"/></svg>pessoa</button>
      ${temDiv?`<div class="fx-dica">Cada pessoa vira um registro em Me devem, na fatura de ${esc(rotuloFatura(l.competencia))}. Toque em “em aberto” quando a pessoa pagar.</div>`:""}

      <div class="eacoes">
        <button class="btn" id="cp-salvar">Salvar</button>
        <button class="btn ghost" id="cp-cancelar">Cancelar</button>
      </div>
    </div>`;

    box.querySelector(".cp-nome").textContent = l.desc || "Compra";
    box.querySelector(".fx-x").onclick = fecharModal;
    box.querySelector("#cp-cancelar").onclick = fecharModal;
    box.querySelector("#cp-salvar").onclick = salvar;
    atualizarSalvar();

    // ── categoria: o botão abre a lista com busca logo abaixo das ações
    const bCat = box.querySelector(".cp-ac-cat");
    bCat.querySelector("em").textContent = catEmoji || "🏷️";
    bCat.querySelector(".cp-ac-t").textContent = catNome;
    bCat.onclick = () => { st.abrirCat = !st.abrirCat; desenhar(); if(st.abrirCat) box.querySelector(".cp-busca").focus(); };
    const busca = box.querySelector(".cp-busca");
    if(busca){
      const lista = box.querySelector(".cp-sel-lista");
      const escolher = c => { st.categoria = c; st.abrirCat = false; desenhar(); box.querySelector(".cp-ac-cat").focus(); };
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

    // ── divisão: você + uma linha por pessoa, com o que já voltou
    const caixa = box.querySelector(".cp-pess");
    if(temDiv){
      const eu = document.createElement("div");
      eu.className = "cp-pes";
      eu.innerHTML = `<span class="cp-av eu">EU</span><span class="cp-pes-n">Você</span><b class="cp-minha"></b>`;
      caixa.appendChild(eu);
    }
    st.divisoes.forEach((d, k) => {
      const row = document.createElement("div");
      row.className = "cp-pes";
      const av = document.createElement("span");
      av.className = "cp-av" + (d.pago ? " pg" : " ab");
      av.textContent = (d.pessoa.trim().charAt(0) || "?").toUpperCase();
      const nome = document.createElement("input");
      nome.className = "cp-pes-n"; nome.placeholder = "Nome"; nome.value = d.pessoa; nome.maxLength = 60;
      nome.setAttribute("aria-label", "Nome da pessoa");
      nome.addEventListener("input", () => { d.pessoa = nome.value; av.textContent = (nome.value.trim().charAt(0) || "?").toUpperCase(); atualizarSalvar(); });
      const tag = document.createElement("button");
      tag.type = "button"; tag.className = "cp-tag" + (d.pago ? " pg" : "");
      tag.textContent = d.pago ? "pago" : "em aberto";
      tag.title = d.pago ? "Toque para marcar como em aberto" : "Toque quando a pessoa pagar";
      tag.onclick = () => { d.pago = !d.pago; desenhar(); };
      const valor = campoMoeda(d.valor, v => { d.valor = v; pintarNumeros(); atualizarSalvar(); });
      valor.classList.add("cp-pes-v"); valor.setAttribute("aria-label", "Valor da pessoa");
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "modal-ic cp-rm"; rm.title = "Tirar da divisão"; rm.setAttribute("aria-label", "Tirar da divisão"); rm.textContent = "×";
      rm.onclick = () => { st.divisoes.splice(k, 1); desenhar(); };
      row.append(av, nome, tag, valor, rm);
      caixa.appendChild(row);
    });
    if(!temDiv) caixa.innerHTML = `<div class="fx-dica">Ninguém na divisão. Use “pessoa” para dividir esta compra.</div>`;
    pintarNumeros();

    box.querySelector(".cp-pessoa").onclick = () => {
      st.divisoes.push({ id:"", pessoa:"", valor:0, pagos:"", pago:false });
      igual(); desenhar();
      const ns = box.querySelectorAll(".cp-pes input.cp-pes-n"); if(ns.length) ns[ns.length-1].focus();
    };
    const bIgual = box.querySelector(".cp-igual");
    if(bIgual) bIgual.onclick = () => { igual(); desenhar(); };
    const comigo = box.querySelector(".cp-comigo input");
    if(comigo) comigo.onchange = () => { st.comigo = comigo.checked; igual(); desenhar(); };

    /** Sua parte, o que já voltou, o que falta e a barra: muda a cada valor digitado. */
    function pintarNumeros(){
      if(!st.divisoes.length) return;
      const v = d => Math.max(0, Number(d.valor)||0);
      const minha = l.valor - st.divisoes.reduce((a,d)=>a+(Number(d.valor)||0), 0);
      const ja = st.divisoes.filter(d=>d.pago).reduce((a,d)=>a+v(d), 0);
      const falta = st.divisoes.filter(d=>!d.pago).reduce((a,d)=>a+v(d), 0);
      const m = box.querySelector(".cp-minha"); m.textContent = BRL.format(minha); m.classList.toggle("neg", minha < -0.004);
      box.querySelector(".cp-ja").textContent = BRL.format(ja);
      const f = box.querySelector(".cp-falta"); f.textContent = BRL.format(falta); f.classList.toggle("zero", falta < 0.005);
      box.querySelector(".cp-barra").innerHTML = `<i class="eu" style="flex:${Math.max(0, minha)}"></i>`
        + st.divisoes.map(d => `<i class="${d.pago?"pg":"ab"}" style="flex:${v(d)}"></i>`).join("");
    }
  }

  /** A divisão como ela seria gravada: só pessoas com nome e valor. */
  function divNormal(ds){
    return ds.map(d => ({ id: d.id || "", pessoa: String(d.pessoa||"").trim(),
                          valor: Math.round((Number(d.valor)||0)*100)/100, pago: !!d.pago }))
             .filter(d => d.pessoa && d.valor > 0);
  }
  /** Tem algo diferente do que está gravado? */
  function mudou(){
    if(st.categoria !== antes.categoria || st.fixa !== antes.fixa || st.role !== antes.role) return true;
    return JSON.stringify(divNormal(st.divisoes)) !== JSON.stringify(divNormal(antes.divisoes));
  }
  /** Salvar fica apagado enquanto não houver mudança. */
  function atualizarSalvar(){
    const b = box.querySelector("#cp-salvar");
    if(!b) return;
    const m = mudou();
    b.disabled = !m;
    b.title = m ? "" : "Nada mudou ainda";
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
    if(!mudou()) return;
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
        if(r && a && (a.pessoa !== pessoa || a.valor !== valor || a.pago !== d.pago)){
          r.pessoa = pessoa; r.valor = valor;
          // uma parcela só: pago = a parcela do mês de início paga
          if(a.pago !== d.pago) r.pagos = d.pago ? compDe(r.mesInicio || r.mes) : "";
          linhasDevem.push(paraBronze("devem", r));
        }
      } else {
        const r = { id: novoId(), mes: l.competencia, mesInicio: l.competencia, pessoa, nome: l.desc,
                    valor, parcelas: 1, pagos: d.pago ? l.competencia : "", transacao: l.id, pago: false, terceiro: false, data: "" };
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
