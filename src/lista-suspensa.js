/* ═══════════ lista suspensa no celular ═══════════
   Camada à parte: não conhece nenhum select específico. Em tela de
   celular (ou toque), o toque num <select> abre a lista no estilo do
   tema; a escolha é gravada no próprio select e dispara "change", do
   mesmo jeito que o seletor nativo faria. No desktop nada muda.     */
(function(){
  // vale para todas as telas: celular e desktop usam a mesma lista
  const MQ = { matches:true };
  const toqueSo = matchMedia("(pointer:coarse)");
  let aberto = null, toque = null;

  function rotulo(sel){
    if(sel.getAttribute("aria-label")) return sel.getAttribute("aria-label");
    if(sel.id){ const l=document.querySelector(`label[for="${sel.id}"]`); if(l) return l.textContent.trim(); }
    const c = sel.closest(".ff,.efield");
    const t = c && c.querySelector(".tagx");
    return t ? t.textContent.trim() : "";
  }
  function fechar(){
    if(!aberto) return;
    aberto.veu.remove(); aberto.lista.remove();
    aberto = null;
  }
  function abrir(sel){
    fechar();
    const r = sel.getBoundingClientRect();
    const cs = getComputedStyle(sel);
    const veu = document.createElement("div"); veu.className="dl-veu";
    const lista = document.createElement("div");
    lista.className="dl-lista"+(sel.id==="f-month"?" mola":""); lista.setAttribute("role","listbox");
    const tit = rotulo(sel);
    if(tit){ lista.setAttribute("aria-label", tit);
      const h=document.createElement("div"); h.className="dl-titulo"; h.textContent=tit; lista.appendChild(h); }

    const check = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>';
    const item = op=>{
      const b=document.createElement("button"); b.type="button"; b.className="dl-op";
      b.setAttribute("role","option");
      b.setAttribute("aria-selected", String(op.selected));
      b.disabled = op.disabled;
      b.style.fontFamily = cs.fontFamily;
      b.innerHTML = `<span></span>${op.dataset.tag?`<i class="dl-tag"></i>`:""}${op.selected?check:""}`;
      b.firstChild.textContent = op.textContent;
      if(op.dataset.tag) b.querySelector(".dl-tag").textContent = op.dataset.tag;
      b.onclick = ev=>{
        const antes = sel.value;
        // seletor do mês (cortina de luz): onda de luz na opção tocada, a
        // lista fecha e o botão vira como uma plaquinha, trocando o nome no meio
        if(lista.classList.contains("mola") && op.index !== sel.selectedIndex
           && !matchMedia("(prefers-reduced-motion: reduce)").matches){
          const rr = b.getBoundingClientRect(), rp = document.createElement("span");
          rp.className = "dl-onda";
          rp.style.left = ((ev.clientX || rr.left + rr.width/2) - rr.left) + "px";
          rp.style.top  = ((ev.clientY || rr.top + rr.height/2) - rr.top) + "px";
          b.appendChild(rp);
          setTimeout(()=>{
            fechar();
            sel.classList.remove("vira"); void sel.offsetWidth; sel.classList.add("vira");
            setTimeout(()=>{
              sel.selectedIndex = op.index;
              sel.dispatchEvent(new Event("input",  {bubbles:true}));
              sel.dispatchEvent(new Event("change", {bubbles:true}));
            }, 220);
          }, 260);
          return;
        }
        sel.selectedIndex = op.index;
        fechar();
        // teclado/mouse: o foco volta ao campo (no toque não, para não abrir teclado)
        if(!toqueSo.matches) sel.focus({preventScroll:true});
        if(sel.value !== antes){
          sel.dispatchEvent(new Event("input",  {bubbles:true}));
          sel.dispatchEvent(new Event("change", {bubbles:true}));
        }
      };
      return b;
    };
    const mesAno = sel.dataset.picker==="mes-ano" && sel.querySelector("optgroup");
    if(mesAno) montarMesAno(sel, lista);
    else [...sel.children].forEach(ch=>{
      if(ch.tagName==="OPTGROUP"){
        const g=document.createElement("div"); g.className="dl-grupo"; g.textContent=ch.label;
        lista.appendChild(g);
        [...ch.children].forEach(op=>{ if(!op.hidden) lista.appendChild(item(op)); });
      } else if(ch.tagName==="OPTION" && !ch.hidden) lista.appendChild(item(ch));
    });

    // posição: abaixo do campo; se não couber, acima. Nunca sai da tela.
    const vw = innerWidth, vh = innerHeight, m = 8;
    // opção com etiqueta (ex.: "aberta") pede um pouco mais de largura
    const larg = Math.min(vw - 2*m, Math.max(r.width, (mesAno || sel.querySelector("option[data-tag]")) ? 260 : 200));
    let x = Math.min(Math.max(m, r.left + r.width/2 - larg/2), vw - m - larg);
    const barra = document.getElementById("tabbar");
    const piso = (barra && getComputedStyle(barra).display!=="none") ? barra.getBoundingClientRect().top : vh;
    const embaixo = piso - r.bottom - m - 6, emcima = r.top - m - 6;
    const acima = embaixo < 220 && emcima > embaixo;
    const alt = Math.min(380, acima ? emcima : embaixo);
    Object.assign(lista.style, { left:x+"px", width:larg+"px", maxHeight:alt+"px" });
    if(acima){ lista.classList.add("acima"); lista.style.bottom = (vh - r.top + 6)+"px"; }
    else lista.style.top = (r.bottom + 6)+"px";

    veu.addEventListener("click", fechar);
    document.body.append(veu, lista);
    aberto = { sel, veu, lista, t: performance.now() };
    // cada coluna (ou a lista) rola até a opção marcada
    lista.querySelectorAll(".dl-col").forEach(col=>{
      const o = col.querySelector('.dl-op[aria-selected="true"]');
      if(o) col.scrollTop = o.offsetTop - col.clientHeight/2 + o.offsetHeight/2;
    });
    const sel0 = lista.querySelector('.dl-op[aria-selected="true"]');
    if(sel0 && !mesAno) sel0.scrollIntoView({block:"center"});
    (sel0 || lista.querySelector(".dl-op"))?.focus({preventScroll:true});
  }

  /* Seletor de mês e ano: duas colunas roláveis lado a lado. O select
     continua sendo a fonte da verdade — as opções vêm agrupadas por ano
     (optgroup) com valor "aaaa-mm", e cada toque grava o novo valor e
     dispara "change", como numa escolha comum. */
  function montarMesAno(sel, lista){
    lista.classList.add("mesano");
    const grupos = [...sel.querySelectorAll("optgroup")];
    const anos = grupos.map(g=>g.label);
    const meses = [...grupos[0].querySelectorAll("option")].map(o=>({
      mm:o.value.slice(5,7), txt:o.textContent.split("/")[0] }));
    const cur = { a:sel.value.slice(0,4), m:sel.value.slice(5,7) };
    const grade = document.createElement("div"); grade.className="dl-mesano";
    const coluna = (rot, itens, chave)=>{
      const wrap = document.createElement("div"); wrap.className="dl-colwrap";
      wrap.innerHTML = `<div class="dl-grupo">${rot}</div>`;
      const col = document.createElement("div"); col.className="dl-col";
      itens.forEach(it=>{
        const b=document.createElement("button"); b.type="button"; b.className="dl-op";
        b.setAttribute("role","option"); b.dataset.v = it.v;
        b.innerHTML = "<span></span>"; b.firstChild.textContent = it.txt;
        b.onclick = ()=>{ cur[chave] = it.v; aplicar(); };
        col.appendChild(b);
      });
      wrap.appendChild(col); grade.appendChild(wrap);
      return col;
    };
    const colM = coluna("Mês", meses.map(x=>({v:x.mm, txt:x.txt})), "m");
    const colA = coluna("Ano", anos.map(a=>({v:a, txt:a})), "a");
    const marcar = ()=>{
      colM.querySelectorAll(".dl-op").forEach(b=>b.setAttribute("aria-selected", String(b.dataset.v===cur.m)));
      colA.querySelectorAll(".dl-op").forEach(b=>b.setAttribute("aria-selected", String(b.dataset.v===cur.a)));
    };
    const aplicar = ()=>{
      marcar();
      const v = `${cur.a}-${cur.m}`;
      if(v === sel.value || ![...sel.options].some(o=>o.value===v)) return;
      sel.value = v;
      sel.dispatchEvent(new Event("input",  {bubbles:true}));
      sel.dispatchEvent(new Event("change", {bubbles:true}));
    };
    marcar();
    lista.appendChild(grade);
    const rod = document.createElement("div"); rod.className="dl-rodape";
    rod.innerHTML = `<button type="button" class="btn dl-ok">Pronto</button>`;
    rod.firstChild.onclick = ()=>{ fechar(); if(!toqueSo.matches) sel.focus({preventScroll:true}); };
    lista.appendChild(rod);
  }

  function alvo(e){
    const s = e.target.closest && e.target.closest("select");
    return (s && !s.disabled && !s.multiple && MQ.matches) ? s : null;
  }
  // toque: guarda onde começou, para não abrir no fim de uma rolagem
  document.addEventListener("touchstart", e=>{
    const s = alvo(e); if(!s){ toque=null; return; }
    const t = e.changedTouches[0]; toque = { s, x:t.clientX, y:t.clientY };
  }, {passive:true, capture:true});
  document.addEventListener("touchend", e=>{
    const s = alvo(e); if(!s || !toque || toque.s!==s) return;
    const t = e.changedTouches[0];
    if(Math.hypot(t.clientX-toque.x, t.clientY-toque.y) > 10) return;
    e.preventDefault();                 // impede a roda nativa
    abrir(s);
  }, {passive:false, capture:true});
  // mouse / caneta em tela estreita
  document.addEventListener("mousedown", e=>{
    const s = alvo(e); if(!s) return;
    e.preventDefault(); abrir(s);
  }, true);

  document.addEventListener("keydown", e=>{
    // campo focado: Enter, Espaço ou Alt+↓ abrem a lista do tema
    if(!aberto){
      const s = e.target && e.target.tagName==="SELECT" ? e.target : null;
      if(s && !s.disabled && !s.multiple &&
         (e.key==="Enter" || e.key===" " || (e.altKey && e.key==="ArrowDown"))){
        e.preventDefault(); abrir(s);
      }
      return;
    }
    if(e.key==="Escape"){ e.stopPropagation(); const s=aberto.sel; fechar(); s.focus({preventScroll:true}); return; }
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      const ops=[...aberto.lista.querySelectorAll(".dl-op:not(:disabled)")];
      let i=ops.indexOf(document.activeElement);
      i = e.key==="ArrowDown" ? Math.min(ops.length-1,i+1) : Math.max(0,i-1);
      ops[i]?.focus(); e.preventDefault();
    }
  }, true);
  addEventListener("resize", fechar);
  document.addEventListener("scroll", e=>{
    // a rolagem que levou o campo até a tela chega logo depois de abrir
    if(aberto && !aberto.lista.contains(e.target) && performance.now()-aberto.t > 250) fechar();
  }, true);
})();
