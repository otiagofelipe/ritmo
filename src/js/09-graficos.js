/* ═══════════════════════════════════════════════════════════
   GRÁFICOS

   SVG desenhado à mão, sem biblioteca: são linhas simples e o app
   é um arquivo só que precisa abrir offline. O viewBox cuida da
   responsividade — o SVG ocupa 100% da largura e a altura segue.
   ═══════════════════════════════════════════════════════════ */

/* ═══════════ tema ═══════════

   As paletas vivem no CSS. O JS precisa das mesmas cores em
   hex literal para desenhar SVG, então em vez de duplicar a lista
   ele lê as variáveis já resolvidas pelo navegador — trocar de tema
   é trocar um atributo e reler.                                    */

const TEMAS = ["retrowave","blue","menta","grafite"];
/** Temas de fundo claro: a raiz ganha data-claro (ver 09-claro.css). */
const TEMAS_CLAROS = ["menta","grafite"];
const PALETA = [];                 // séries dos gráficos, vem do tema
const CORES  = {};                 // cores nomeadas, vem do tema

const lerCor = nome =>
  getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || "#888888";

function aplicarTema(id){
  if(!TEMAS.includes(id)) id = TEMAS[0];
  document.documentElement.setAttribute("data-tema", id);
  document.documentElement.toggleAttribute("data-claro", TEMAS_CLAROS.includes(id));
  S.tema = id;
  // barra do navegador no celular na cor do fundo do tema
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", lerCor("--bg-primary"));
  try{ localStorage.setItem("ritmo:tema-rw", id); }catch(e){}

  Object.assign(CORES, {
    itau:lerCor("--c-itau"), picpay:lerCor("--c-picpay"), caju:lerCor("--c-caju"),
    devem:lerCor("--c-devem"), devo:lerCor("--c-devo"), fixos:lerCor("--c-fixos"),
    acento:lerCor("--purple-primary"), azul:lerCor("--blue-light"),
    ok:lerCor("--success"), aviso:lerCor("--warning"), erro:lerCor("--danger"),
    texto:lerCor("--text-primary"), suave:lerCor("--text-secondary")
  });

  PALETA.length = 0;
  for(let i=1;i<=8;i++) PALETA.push(lerCor("--c-serie-"+i));

  // contas e quadros carregam a cor consigo: repinta na troca
  CONTAS.forEach(c=>{ if(CORES[c.id]) c.cor = CORES[c.id]; });
  GRUPOS.forEach(g=>{
    const k = g.grupoPlanilha==="caju" ? "caju" : g.id;
    if(CORES[k]) g.cor = CORES[k];
  });

  document.querySelectorAll("#temas button").forEach(b=>
    b.setAttribute("aria-pressed", String(b.dataset.tema===id)));
}

/** Todo valor de gráfico leva R$: eixo, rótulo, tooltip. */
const RS  = v => "R$ " + BRL0.format(Math.round(v));
const RS2 = v => BRL.format(v);

/**
 * Valor curto para gráfico apertado: R$ 3,3k a partir de mil, e o
 * número cheio abaixo disso. Um eixo de faturas com R$ 10.453,41 em
 * cada ponto vira uma parede de dígitos.
 */
function RSk(v){
  const n = Number(v)||0, abs = Math.abs(n);
  if(abs < 1000) return "R$ " + BRL0.format(Math.round(n));
  const mil = n/1000;
  const txt = (Math.abs(mil) >= 100 ? Math.round(mil) : Math.round(mil*10)/10);
  return "R$ " + String(txt).replace(".", ",") + "k";
}

/**
 * Escala "redonda" para o eixo Y: passo 1, 2, 2,5 ou 5 vezes uma
 * potência de dez, para sair R$ 0 / R$ 200 / R$ 400 em vez de
 * R$ 1.046. O topo é o primeiro múltiplo do passo acima do maior
 * valor, então o eixo se adapta sozinho a qualquer grandeza.
 */
function escalaBonita(min, max, alvoDivisoes){
  const divs = alvoDivisoes || 5;
  if(!(max>min)) max = min + 1;
  const bruto = (max-min)/divs;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto/pot;
  const passo = (norm<=1 ? 1 : norm<=2 ? 2 : norm<=2.5 ? 2.5 : norm<=5 ? 5 : 10) * pot;
  return {
    min: Math.floor(min/passo)*passo,
    max: Math.ceil(max/passo)*passo,
    passo
  };
}

/**
 * Desenha um gráfico de linhas.
 *
 *   labels    rótulos do eixo X
 *   series    [{nome, cor, valores, area, tracejada}]
 *   destaque  índice a marcar (semana em curso, dia de hoje, mês aberto)
 *   fmtTip    formatador do valor no tooltip
 */
function grafico(alvoId, cfg){
  const box = $(alvoId);
  if(!box) return;
  const labels = cfg.labels || [];
  const labelsTip = cfg.labelsTip || labels;
  const series = (cfg.series || []).filter(s=>s && s.valores && s.valores.length);

  if(!labels.length || !series.length){
    box.innerHTML = `<div class="blank">${escHtml(cfg.vazio || "Sem dados para o período.")}</div>`;
    return;
  }

  /* O SVG escala pela largura do bloco. Com viewBox de 720 numa tela
     de 360px a altura cai pela metade e o gráfico vira um risco.
     No celular o viewBox passa a ter a largura real da caixa (escala
     1:1, então o texto sai no tamanho do CSS) e o gráfico fica mais
     alto; os rótulos de referência vão para dentro da área útil, em
     vez de ocupar uma margem à direita. */
  const estreito = (typeof window !== "undefined" && window.innerWidth <= 760);
  // largura real da caixa em qualquer tela: o texto sai no tamanho do CSS
  // e o gráfico acompanha a página ao estreitar ou alargar a janela
  const W = Math.max(280, Math.round(box.clientWidth || (estreito ? 340 : 720)));
  const H = estreito ? Math.round((cfg.altura || 190) * 1.3) : (cfg.altura || 190);
  // largura média de um caractere dos rótulos (fonte mono do CSS)
  const CW = 6.1;
  /* O brilho neon é um filtro SVG com região fixa em px. Com o gráfico
     desenhado na largura real da caixa, uma região de 820px cortava a
     linha no meio em telas largas (os pontos, sem filtro, seguiam).
     A região cresce até caber o maior gráfico já desenhado. */
  const neon = document.getElementById("rt-neon");
  if(neon){
    if(W + 80 > Number(neon.getAttribute("width")))  neon.setAttribute("width",  W + 80);
    if(H + 80 > Number(neon.getAttribute("height"))) neon.setAttribute("height", H + 80);
  }

  // compacto: eixo e rótulos em "R$ 3,3k"; o tooltip segue completo.
  // No celular o eixo é sempre compacto: sobra largura para o gráfico.
  const fmtEixo   = (cfg.compacto || estreito) ? RSk : RS;
  const fmtRotulo = cfg.compacto ? RSk : RS2;
  // com faixas nomeadas, sobra um respiro no topo para elas
  /* Rótulo de referência mora numa faixa própria à direita. Desenhado
     por cima da área do gráfico, ele brigava com o valor das barras. */
  const refsCfg = (cfg.refs || []).filter(r=>Number.isFinite(r.v));
  const textosMargem = refsCfg.map(r=>String(r.rot||""))
    .concat((cfg.series||[]).filter(x=>x.rotuloPonta)
      .map(x=>x.rotuloPonta+": R$ 000.000"));
  const larguraRef = (textosMargem.length && !estreito)
    ? Math.max(...textosMargem.map(t=>t.length)) * 5.8 + 10
    : 0;
  let pl = estreito ? 40 : 46;
  const pr = estreito ? 8 : Math.max(10, larguraRef),
        pt = (cfg.faixas && cfg.faixas.length) ? 24 : 12, pb = estreito ? 26 : 24;
  let largura = W - pl - pr;
  const altura = H - pt - pb;

  const todos = series.flatMap(s=>s.valores.filter(v=>Number.isFinite(v)));
  const brutoMax = Math.max(...todos, ...(cfg.refs||[]).map(r=>r.v||0), 0);
  const brutoMin = Math.min(...todos, 0);
  // eixo em passos redondos; sobra uma divisão em cima para os rótulos
  const esc = escalaBonita(brutoMin, brutoMax * (cfg.rotulos?1.1:1.02), cfg.divisoes);
  const vMin = esc.min, vMax = esc.max;
  // a margem esquerda mede o maior rótulo do eixo Y
  {
    let maior = 0;
    for(let v=vMin; v<=vMax+esc.passo/2; v+=esc.passo) maior = Math.max(maior, fmtEixo(v).length);
    pl = Math.round(maior*5.8 + 10);
    largura = W - pl - pr;
  }

  const n = labels.length;
  const barras = cfg.estilo === "barras";
  /* Linha marca pontos; barra ocupa uma faixa. Centrar a barra no
     ponto fazia a primeira e a última saírem pela metade para fora da
     área útil — e invadirem a margem dos rótulos de referência. */
  const x = barras
    ? i => pl + (i + 0.5) * (largura/Math.max(n,1))
    : i => pl + (n===1 ? largura/2 : i*largura/(n-1));
  const y = v => pt + altura - ((v-vMin)/(vMax-vMin))*altura;

  // ── malha e eixo Y, em passos redondos e sempre com R$
  let g = "";
  for(let v=vMin; v<=vMax+esc.passo/2; v+=esc.passo){
    const yy = y(v);
    g += `<line class="ggrid" x1="${pl}" y1="${yy.toFixed(1)}" x2="${W-pr}" y2="${yy.toFixed(1)}"/>`;
    g += `<text class="gaxis" x="${pl-7}" y="${(yy+3).toFixed(1)}" text-anchor="end">${escHtml(fmtEixo(v))}</text>`;
  }

  // ── eixo X: no máximo 7 rótulos para não embolar no celular
  /* No celular, quantos rótulos cabem depende da largura real: cada
     um ocupa o texto mais longo e um respiro. */
  const cabem = Math.max(2, Math.floor(largura / (Math.max(...labels.map(l=>String(l).length))*5.8 + 16)));
  const passo = Math.max(1, Math.ceil(n/cabem));
  const mostrados = [];
  if(cfg.eixoIndices){
    // rótulos escolhidos por fora (ex.: só o primeiro dia de cada semana)
    cfg.eixoIndices.filter(i=>i>=0 && i<n).forEach(i=>mostrados.push(i));
  } else {
    for(let i=0;i<n;i++) if(i%passo===0) mostrados.push(i);
    /* O último rótulo só entra se sobrar espaço: forçá-lo sempre grudava
       "nov/26" em "dez/26" quando o passo não fechava certo no fim. */
    const ultimo = mostrados[mostrados.length-1];
    if(ultimo !== n-1 && (n-1-ultimo) >= passo) mostrados.push(n-1);
  }

  for(const i of mostrados){
    // barra é centrada na faixa: o rótulo acompanha o centro
    const ancora = barras ? "middle"
      : (i===0 ? "start" : (i===n-1 ? "end" : "middle"));
    g += `<text class="gaxis" x="${x(i).toFixed(1)}" y="${H-7}" text-anchor="${ancora}">${escHtml(labels[i])}</text>`;
  }

  /* Linhas de referência horizontais (target, média). O rótulo fica
     só na ponta direita; se duas caírem quase na mesma altura, a
     segunda desce para o outro lado da linha. */
  const usados = [];
  refsCfg.forEach(r=>{
    const yr = y(r.v);
    g += `<line class="gref" x1="${pl}" y1="${yr.toFixed(1)}" x2="${W-pr}" y2="${yr.toFixed(1)}"
            stroke="${r.cor||"var(--warning)"}"/>`;
    if(estreito){
      // celular: rótulo dentro da área, alinhado à direita, logo acima da linha
      let yl = yr - 5;
      if(yl < pt + 8 || usados.some(u=>Math.abs(u-yl)<13)) yl = yr + 13;
      usados.push(yl);
      g += `<text class="gref-txt dentro" x="${(W-pr-2).toFixed(1)}" y="${yl.toFixed(1)}" text-anchor="end"
              fill="${r.cor||"var(--warning)"}">${escHtml(r.rot)}</text>`;
      return;
    }
    let yl = yr + 3;
    if(usados.some(u=>Math.abs(u-yl)<11)) yl = yr + 14;
    usados.push(yl);
    g += `<text class="gref-txt" x="${(W-pr+5).toFixed(1)}" y="${yl.toFixed(1)}" text-anchor="start"
            fill="${r.cor||"var(--warning)"}">${escHtml(r.rot)}</text>`;
  });

  // ── faixas: nome da semana centralizado entre as divisórias
  for(const f of (cfg.faixas || [])){
    const a0 = x(Math.max(f.i0,0)), a1 = x(Math.min(f.i1, n-1));
    const larg = a1-a0;
    if(larg < 26) continue;
    const txt = larg > 92 ? f.rot : (f.curto || f.rot);
    g += `<text class="gfaixa" x="${((a0+a1)/2).toFixed(1)}" y="${(pt-8).toFixed(1)}"
            text-anchor="middle">${escHtml(txt)}</text>`;
  }

  // ── divisórias: separam as semanas no gráfico diário
  for(const i of (cfg.divisorias || []))
    if(i>0 && i<n)
      g += `<line class="gsep" x1="${x(i).toFixed(1)}" y1="${pt}" x2="${x(i).toFixed(1)}" y2="${pt+altura}"/>`;

  // ── marca do momento (hoje, semana em curso, fatura aberta)
  const d = cfg.destaque;
  if(Number.isInteger(d) && d>=0 && d<n)
    g += `<line class="gnow" x1="${x(d).toFixed(1)}" y1="${pt}" x2="${x(d).toFixed(1)}" y2="${pt+altura}"/>`;

  // ── séries
  const rotulos = [];
  const larguraBarra = barras ? Math.min(46, (largura/Math.max(n,1))*0.62) : 0;

  series.forEach((s,si)=>{
    const cor = s.cor || PALETA[si%PALETA.length];
    /* `estender` prolonga a linha até as bordas repetindo o primeiro e
       o último valor — é o que faz uma série de referência parecer uma
       régua, como a linha de média. */
    const pts = s.valores.map((v,i)=>`${x(i).toFixed(1)},${y(Number(v)||0).toFixed(1)}`);
    if(s.estender && n){
      pts.unshift(`${pl},${y(Number(s.valores[0])||0).toFixed(1)}`);
      pts.push(`${(W-pr).toFixed(1)},${y(Number(s.valores[n-1])||0).toFixed(1)}`);
    }

    // uma série pode pedir linha mesmo num gráfico de barras
    const comoBarra = barras && !s.linha;
    if(comoBarra){
      const base = y(Math.max(vMin,0));
      s.valores.forEach((bruto,i)=>{
        const v = Number(bruto)||0, yy = y(v);
        const topo = Math.min(yy, base), alt = Math.max(Math.abs(base-yy), 1);
        g += `<rect class="gbar${i===d?" agora":""}" x="${(x(i)-larguraBarra/2).toFixed(1)}"
                y="${topo.toFixed(1)}" width="${larguraBarra.toFixed(1)}" height="${alt.toFixed(1)}"
                rx="3" fill="${cor}"/>`;
      });
    } else {
    if(cfg.suave){
      // linha arredondada: curva que passa pelos pontos sem "passar do ponto"
      const curva = caminhoSuave(pts.map(p=>p.split(",").map(Number)));
      if(s.area)
        g += `<path class="garea" fill="${cor}" d="${curva} L${x(n-1).toFixed(1)},${y(vMin).toFixed(1)} L${x(0).toFixed(1)},${y(vMin).toFixed(1)} Z"/>`;
      g += `<path class="gline" stroke="${cor}"${s.tracejada?' stroke-dasharray="5 4" stroke-width="1.5"':""} d="${curva}"/>`;
    } else {
    if(s.area)
      g += `<polygon class="garea" fill="${cor}" points="${x(0).toFixed(1)},${y(vMin).toFixed(1)} ${pts.join(" ")} ${x(n-1).toFixed(1)},${y(vMin).toFixed(1)}"/>`;
    g += `<polyline class="gline" stroke="${cor}"${s.tracejada?' stroke-dasharray="5 4" stroke-width="1.5"':""} points="${pts.join(" ")}"/>`;
    }
    // pontos só quando cabem, senão vira colar de contas
    if((cfg.pontos || n<=24) && !s.tracejada)
      s.valores.forEach((v,i)=>{
        const r = i===d ? 4 : (cfg.pontos ? 2 : 2.8);
        const cx = x(i), cy = y(Number(v)||0);
        if(s.formas && s.formas[i]==="grande"){
          // bolinha maior: marca própria para alguns dias (quinta a sábado)
          g += `<circle class="gdot grande" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(r*1.9,4.2)}" fill="${cor}"/>`;
        } else
          g += `<circle class="gdot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${cor}"/>`;
      });
    }

    // rótulo na margem direita, no estilo das linhas de referência
    if(s.rotuloPonta){
      const iRef = Number.isInteger(s.rotuloPontaIndice) ? s.rotuloPontaIndice : n-1;
      const vRef = Number(s.valores[Math.min(Math.max(iRef,0), n-1)])||0;
      g += estreito
        ? `<text class="gref-txt dentro" x="${(W-pr-2).toFixed(1)}" y="${(y(vRef)-6).toFixed(1)}"
              text-anchor="end" fill="${cor}">${escHtml(s.rotuloPonta+": "+RS(vRef))}</text>`
        : `<text class="gref-txt" x="${(W-pr+5).toFixed(1)}" y="${(y(vRef)+3).toFixed(1)}"
              text-anchor="start" fill="${cor}">${escHtml(s.rotuloPonta+": "+RS(vRef))}</text>`;
    }

    /* Valores escritos no gráfico: coletados aqui, posicionados
       depois. Uma série pode pedir rótulo próprio — e pedir que ele
       fique embaixo do ponto, para não brigar com a série de cima. */
    const proprio = s.rotulo;                       // "acima" | "abaixo"
    if(cfg.rotulos || proprio){
      const total = n * (cfg.rotulos==="todos" ? series.length : 1);
      const modo = (cfg.rotulos==="todos" && total>36) ? "picos" : cfg.rotulos;
      const pulaSerie = !proprio && (modo==="picos" || modo==="total") && si>0;

      if(!pulaSerie){
        const alvos = proprio
          ? (s.rotuloIndices || s.valores.map((_,i)=>i))
          : (modo==="picos" ? (cfg.picosIndices || indicesDosPicos(s.valores, cfg.nPicos||5))
                            : s.valores.map((_,i)=>i));
        alvos.forEach(i=>{
          if(i<0 || i>=n) return;
          const v = Number(s.valores[i])||0;
          if(!proprio && modo==="picos" && v<=0) return;
          rotulos.push({ x:x(i), y:y(v), txt:fmtRotulo(v), cor,
                         pico: !proprio && modo==="picos",
                         abaixo: proprio==="abaixo" });
        });
      }
    }
  });

  /* Os rótulos de séries diferentes caem quase no mesmo ponto quando
     as linhas se cruzam. Em vez de deixar um por cima do outro, cada
     um sobe até achar espaço livre; se bater no topo, desce. */
  const LARG = t => t.length*CW + 4, ALT = estreito ? 13 : 11;
  const postos = [];
  rotulos.sort((a,b)=>a.y-b.y).forEach(r=>{
    const w = LARG(r.txt);
    let desc = !!r.abaixo;
    let cy = desc ? r.y + 14 : r.y - (r.pico?12:9);
    let tentativa = 0;
    const bate = yy => postos.some(p=>
      Math.abs(p.cx-r.x) < (w+p.w)/2 && Math.abs(p.cy-yy) < ALT);
    while(bate(cy) && tentativa<8){
      tentativa++;
      if(!desc && cy-ALT < pt){ desc = true; tentativa = 0; }
      cy = desc ? r.y + (r.abaixo?14:9) + tentativa*ALT : r.y - 9 - tentativa*ALT;
    }
    postos.push({cx:r.x, cy, w});
    const anc = r.x < pl+w/2 ? "start" : (r.x > W-pr-w/2 ? "end" : "middle");
    const px = anc==="start" ? pl : (anc==="end" ? W-pr : r.x);
    if(r.pico)
      g += `<circle cx="${r.x.toFixed(1)}" cy="${r.y.toFixed(1)}" r="5.5" fill="none"
              stroke="var(--warning)" stroke-width="1.6"/>`;
    g += `<text class="${r.pico?"gpico":"glabel"}" x="${px.toFixed(1)}" y="${cy.toFixed(1)}"
            text-anchor="${anc}"${r.pico?"":` fill="${r.cor}"`}>${escHtml(r.txt)}</text>`;
  });

  // ── áreas de captura do mouse  });

  // ── áreas de captura do mouse, uma por posição do eixo
  const meia = n===1 ? largura : largura/(n-1);
  for(let i=0;i<n;i++)
    g += `<rect class="ghit" data-i="${i}" x="${(x(i)-meia/2).toFixed(1)}" y="${pt}" width="${meia.toFixed(1)}" height="${altura}"/>`;

  // sem preserveAspectRatio="none": esticar o viewBox deformaria
  // texto e pontos. A caixa escala proporcional ao viewBox.
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
      aria-label="${escHtml(cfg.titulo||"gráfico")}">${g}</svg>
    <div class="chart-tip"></div>`
    + (series.length>1 && !cfg.semLegenda ? `<div class="legend">${series.map((s,si)=>
        `<span><i style="background:${s.cor||PALETA[si%PALETA.length]}"></i>${escHtml(s.nome||"")}</span>`).join("")}</div>` : "");

  ligarTooltip(box, {labels:labelsTip, series, x, W, H,
    detalhes: cfg.detalhes || null, fmt: cfg.fmtTip || RS2, aoTocar: cfg.aoTocar || null});
}

/**
 * Caminho SVG suave por uma lista de pontos [x,y]: cúbica monótona
 * (Fritsch–Carlson). Arredonda as quinas sem criar picos falsos —
 * trecho reto continua reto e a curva nunca sobe além do ponto.
 */
function caminhoSuave(p){
  const n = p.length;
  if(n < 3) return p.map((q,i)=>`${i?"L":"M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");
  const dx=[], m=[], t=new Array(n);
  for(let i=0;i<n-1;i++){ dx[i]=p[i+1][0]-p[i][0]; m[i]= dx[i] ? (p[i+1][1]-p[i][1])/dx[i] : 0; }
  t[0]=m[0]; t[n-1]=m[n-2];
  for(let i=1;i<n-1;i++) t[i] = (m[i-1]*m[i] <= 0) ? 0 : (m[i-1]+m[i])/2;
  for(let i=0;i<n-1;i++){
    if(m[i]===0){ t[i]=0; t[i+1]=0; continue; }
    const a=t[i]/m[i], b=t[i+1]/m[i], s=a*a+b*b;
    if(s>9){ const k=3/Math.sqrt(s); t[i]=k*a*m[i]; t[i+1]=k*b*m[i]; }
  }
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for(let i=0;i<n-1;i++){
    const h3 = dx[i]/3;
    d += ` C${(p[i][0]+h3).toFixed(1)},${(p[i][1]+t[i]*h3).toFixed(1)} ${(p[i+1][0]-h3).toFixed(1)},${(p[i+1][1]-t[i+1]*h3).toFixed(1)} ${p[i+1][0].toFixed(1)},${p[i+1][1].toFixed(1)}`;
  }
  return d;
}

/** Tooltip acompanha o mouse pelas faixas invisíveis do gráfico. */
function ligarTooltip(box, ctx){
  const tip = box.querySelector(".chart-tip");
  const svg = box.querySelector("svg");
  if(!tip || !svg) return;

  const mostrar = i => {
    const linhas = ctx.series.map((s,si)=>{
      const v = Number(s.valores[i]);
      if(!Number.isFinite(v)) return "";
      const cor = s.cor || PALETA[si%PALETA.length];
      return `<div class="k">${ctx.series.length>1?`<i style="background:${cor}"></i>`:""}
        ${ctx.series.length>1?escHtml(s.nome||"")+" ":""}<b>${esc(ctx.fmt(v))}</b></div>`;
    }).join("");
    const extra = (ctx.detalhes && ctx.detalhes[i] || [])
      .map(d=>`<div class="k sub"><i style="background:${d.cor}"></i>${escHtml(d.nome)}
        <b>${escHtml(ctx.fmt(d.valor))}</b></div>`).join("");
    tip.innerHTML = `<div style="opacity:.7;margin-bottom:2px">${escHtml(ctx.labels[i])}</div>${linhas}${extra}`;
    // o SVG é esticado: converte a coordenada interna para % da caixa
    // presa entre 8% e 92% para não vazar da caixa nas pontas
    const pc = Math.min(92, Math.max(8, ctx.x(i)/ctx.W*100));
    tip.style.left = pc.toFixed(2)+"%";
    tip.style.top  = "6px";
    tip.style.opacity = "1";
  };

  svg.querySelectorAll(".ghit").forEach(r=>{
    const i = Number(r.dataset.i);
    r.addEventListener("mouseenter", ()=>mostrar(i));
    r.addEventListener("touchstart", e=>{
      mostrar(i); e.stopPropagation();
      // no toque não existe "tirar o mouse": o balão some sozinho
      clearTimeout(tip._fecha);
      tip._fecha = setTimeout(()=>{ tip.style.opacity="0"; }, 2500);
    }, {passive:true});
    // gráfico com ação no toque (ex.: abrir o card da semana)
    if(ctx.aoTocar){
      r.style.cursor = "pointer";
      r.addEventListener("click", ()=>{ tip.style.opacity="0"; ctx.aoTocar(i); });
    }
  });
  box.addEventListener("mouseleave", ()=>{ tip.style.opacity="0"; });
}

// tocar fora de um gráfico fecha qualquer balão aberto
document.addEventListener("touchstart", ()=>{
  document.querySelectorAll(".chart-tip").forEach(t=>{ t.style.opacity="0"; });
}, {passive:true});

/**
 * Visualização em tabela dos gráficos do Dashboard. `linhas` já vem
 * em HTML de <tr>; aqui só entra a moldura comum.
 */
function tabelaVis(alvoId, cabecalho, linhas, rodape){
  const box = $(alvoId);
  if(!box) return;
  box.innerHTML = linhas.length
    ? `<div class="tab-wrap alto vis"><table class="tab-fat tab-vis">
        <thead><tr>${cabecalho.map((c,i)=>`<th${i===cabecalho.length-1?' class="n"':""}>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${linhas.join("")}</tbody>
        ${rodape ? `<tfoot>${rodape}</tfoot>` : ""}
      </table></div>`
    : `<div class="blank">Sem lançamentos nesta fatura.</div>`;
}

/**
 * Encolhe a letra (e o respiro das linhas) da tabela até ela caber na
 * altura da caixa — sem barra de rolagem. Para em 8px.
 */
function caberNaCaixa(box){
  const tab = box.querySelector("table");
  if(!tab || !box.clientHeight) return;
  let fs = 13;
  const aplicar = () => {
    tab.style.setProperty("--fs",  fs+"px");
    tab.style.setProperty("--pad", Math.max(1, fs*0.55).toFixed(1)+"px");
  };
  aplicar();
  while(tab.offsetHeight > box.clientHeight && fs > 8){ fs -= 0.5; aplicar(); }
}

/**
 * Pizza das semanas, no estilo da página: rosca escura com arcos neon
 * nas cores do tema (pink → roxo → azul), um respiro entre as fatias,
 * a semana em curso mais grossa e com brilho, e o total no miolo em
 * Bebas. Legenda ao lado com a % e o valor.
 */
const COR_FATIA = [
  "var(--rt-pink)",
  "var(--rt-purple)",
  "var(--rt-blue)",
  "color-mix(in srgb, var(--rt-pink) 55%, var(--rt-purple))",
  "color-mix(in srgb, var(--rt-purple) 50%, var(--rt-blue))",
  "var(--rt-text-muted)"
];
function pizzaSemanas(box, semanas, valores, agora, alt, media){
  const total = valores.reduce((a,v)=>a+Math.max(0,v),0);
  if(total <= 0){ box.innerHTML = `<div class="blank">Sem lançamentos nesta fatura.</div>`; return; }
  const estreito = window.innerWidth <= 760;
  // desktop: cabe na altura do quadro; celular: rosca em cima, largura manda
  const lado = estreito
    ? Math.round(Math.max(96, Math.min(alt - 8, box.clientWidth * 0.36)))
    : Math.round(Math.max(96, Math.min(alt - 8, box.clientWidth * 0.40)));
  const c = lado/2;
  const esp = Math.max(10, lado*0.12);            // espessura do anel
  const r = c - esp/2 - 6;
  const cor = i => COR_FATIA[i % COR_FATIA.length];
  const vivos = valores.filter(v=>v>0).length;
  const folga = vivos > 1 ? Math.min(0.06, 3/r) : 0;  // respiro entre fatias (rad)
  const ponto = a => [c + r*Math.cos(a), c + r*Math.sin(a)];

  let ang = -Math.PI/2, arcos = "";
  valores.forEach((v,i)=>{
    if(v <= 0) return;
    const f = v/total, a0 = ang + folga/2, a1 = ang + f*2*Math.PI - folga/2;
    ang += f*2*Math.PI;
    const tit = `<title>${esc(semanas[i].rot)} · ${esc(RS2(v))} · ${(f*100).toFixed(1).replace(".",",")}%</title>`;
    const cls = "pz-arco" + (i===agora ? " agora" : "");
    const dado = ` data-sem="${i}"`;
    const larg = i===agora ? esp+4 : esp;
    if(f > 0.9999){
      arcos += `<circle class="${cls}"${dado} cx="${c}" cy="${c}" r="${r}" style="stroke:${cor(i)}" stroke-width="${larg}">${tit}</circle>`;
    } else if(a1 > a0){
      const [x0,y0] = ponto(a0), [x1,y1] = ponto(a1);
      arcos += `<path class="${cls}"${dado} style="stroke:${cor(i)}" stroke-width="${larg}"
        d="M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${(a1-a0)>Math.PI?1:0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}">${tit}</path>`;
    }
  });

  const leg = semanas.map((w,i)=>{
    const v = valores[i], f = Math.max(0,v)/total;
    return `<button type="button" class="pz-item${i===agora?" agora":""}${v<=0?" zero":""}" data-sem="${i}"
        title="Ver as compras desta semana">
      <i style="background:${cor(i)}"></i>
      <span class="pz-nm">${esc(estreito ? String(w.rot).replace(" - ","–") : w.rot)}</span>
      <span class="pz-v">${esc(RS2(v))}</span>
      <span class="pz-p">(${(f*100).toFixed(0)}%)</span></button>`;
  }).join("");

  // total do mês no miolo: "R$ 7,2k" cabe em qualquer tamanho de anel
  box.innerHTML = `<div class="pz">
    <div class="pz-anel" style="width:${lado}px;height:${lado}px">
      <svg class="pz-svg" width="${lado}" height="${lado}" style="width:${lado}px;height:${lado}px"
        viewBox="0 0 ${lado} ${lado}" role="img" aria-label="participação de cada semana no gasto do mês">
        <circle class="pz-trilho" cx="${c}" cy="${c}" r="${r}" stroke-width="${esp}"/>
        ${arcos}
      </svg>
      <div class="pz-miolo"><span class="pz-rot">total</span>
        <span class="pz-bloco"><span class="pz-tot">${esc(RSk(total))}</span>
        <span class="pz-med">${esc(RS2(media||0))}</span></span></div>
    </div>
    <div class="pz-leg">${leg}</div></div>`;
  // tocar numa semana (na legenda ou no anel) abre o card com as compras dela
  box.querySelectorAll("[data-sem]").forEach(el=>el.addEventListener("click", ()=>cardSemana(+el.dataset.sem, semanas)));
  ajustarMedia(box);
  // a fonte do total pode chegar depois e mudar a largura dele: mede de novo
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>ajustarMedia(box));
  if(window.ResizeObserver){
    const tot = box.querySelector(".pz-tot");
    if(tot) new ResizeObserver(()=>ajustarMedia(box)).observe(tot);
  }
}

/**
 * "Holerite" do Posso gastar: a mesma conta do card, linha por linha, como
 * um demonstrativo de pagamento. Proventos: salário, me devem e a sobra do
 * Caju. Descontos: as faturas, os fixos que ainda vão cair e o eu devo.
 * O líquido é o Posso gastar.
 */
function abrirHolerite(){
  const { cartoes, teto, gastoCaju, previstoFixas, faturas, devo, devem, posso } = contasDoMes();
  const salario = salarioDe(S.mesSel);
  // faturas com fixos e parcelas; abre em avulsos, fixos e parcelas (Itaú + PicPay)
  const idsFixas = idsCobrancasFixas(S.mesSel);
  const parc = soma(cartoes.filter(x=>x.parcela));
  const fixo = soma(cartoes.filter(x=>!x.parcela && (x.fixa || idsFixas.has(x.id)))) + (S.soRole ? 0 : previstoFixas);
  // eu devo e me devem abrem no resumo por pessoa
  const porPessoa = id => {
    const m = new Map();
    for(const i of itensContados(id)){ const k = rotuloPessoa(i) || "—"; m.set(k, (m.get(k)||0) + (Number(i.valor)||0)); }
    return [...m.entries()].sort((x,y)=>y[1]-x[1]);
  };
  /* O Caju entra pelo valor do vale (Entradas) e sai pelo que foi gasto
     nele. Gasto acima do vale não desconta do salário (o saldo usa só a
     sobra do Caju), então a saída do Caju para no valor do vale. */
  const ENT = [
    { n:"Salário",   v:salario, t:"p" },
    { n:"Caju",      v:teto,    t:"p" },
    { n:"Me devem",  v:devem,   t:"p", sub:porPessoa("devem") }
  ];
  const SAI = [
    { n:"Faturas",    v:faturas,                   t:"d", sub:[["Avulsos", faturas - parc - fixo], ["Fixos", fixo], ["Parcelas", parc]] },
    { n:"Gasto Caju", v:Math.min(gastoCaju, teto), t:"d" },
    { n:"Eu devo",    v:devo,                      t:"d", sub:porPessoa("devo") }
  ];
  const tEnt = ENT.reduce((a,l)=>a+l.v,0), tSai = SAI.reduce((a,l)=>a+l.v,0);
  const sobraCaju = Math.max(teto - gastoCaju, 0), sobraCartao = posso - sobraCaju;
  const valor = l => `<b>${l.t==="p" ? "+" : "−"} ${esc(BRL.format(l.v))}</b>`;
  const linha = l => (l.sub && l.sub.length)
    ? `<div class="hol-g" data-k="${esc(l.n)}"><button type="button" class="hol-l ${l.t}${l.v ? "" : " zero"}" aria-expanded="false">
        <span>${esc(l.n)}<svg class="hol-seta" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron"/></svg></span>${valor(l)}</button>
        <div class="hol-sub"><div class="hol-sub-in">${l.sub.map(([n,v])=>
          `<div class="hol-s${v ? "" : " zero"}"><span>${esc(n)}</span><b>${esc(BRL.format(v))}</b></div>`).join("")}</div></div></div>`
    : `<div class="hol-l ${l.t}${l.v ? "" : " zero"}"><span>${esc(l.n)}</span>${valor(l)}</div>`;
  const box = abrirModal(()=>fecharModal(), abrirHolerite);
  // redesenhado por um filtro: o que estava aberto continua aberto
  const abertos = new Set([...box.querySelectorAll(".hol .aberto[data-k]")].map(e=>e.dataset.k));
  box.innerHTML = `<div class="fx-ed hol">
    <div class="modal-topo">
      <h3><span class="fx-titulo">Holerite</span> <span class="mes">${rotuloFaturaHTML(S.mesSel)}</span></h3>
      <button type="button" class="modal-ic fx-x" title="Fechar" aria-label="Fechar">×</button>
    </div>
    <div class="hol-lista">${ENT.map(linha).join("")}
      <div class="hol-soma p"><span>Entradas</span><b>${esc(BRL.format(tEnt))}</b></div>
      ${SAI.map(linha).join("")}
      <div class="hol-soma d"><span>Saídas</span><b>${esc(BRL.format(tSai))}</b></div></div>
    <div class="hol-fim" data-k="fim">
      <button type="button" class="hol-liq${posso<0?" neg":""}" aria-expanded="false"><span>Saldo do mês<svg class="hol-seta" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron"/></svg></span><b>${esc(BRL.format(posso))}</b></button>
      <div class="hol-sub"><div class="hol-sub-in">
        <div class="hol-s"><span>Cartões</span><b>${esc(BRL.format(sobraCartao))}</b></div>
        <div class="hol-s"><span>Caju</span><b>${esc(BRL.format(sobraCaju))}</b></div></div></div>
    </div>
  </div>`;
  // saldo do mês abre no que sobra: no salário (cartões) e no vale (Caju)
  const fim = box.querySelector(".hol-fim");
  fim.firstElementChild.onclick = () => { const sim = !fim.classList.contains("aberto");
    fim.classList.toggle("aberto", sim); fim.firstElementChild.setAttribute("aria-expanded", String(sim)); };
  box.querySelectorAll(".hol-g > .hol-l").forEach(b=>b.onclick = () => {
    const g = b.parentElement, sim = !g.classList.contains("aberto");
    g.classList.toggle("aberto", sim); b.setAttribute("aria-expanded", String(sim));
  });
  box.querySelector(".fx-x").onclick = fecharModal;
  box.querySelectorAll("[data-k]").forEach(el=>{ if(abertos.has(el.dataset.k)){
    el.classList.add("aberto"); el.querySelector("[aria-expanded]").setAttribute("aria-expanded","true"); } });
}

/**
 * Card com as compras de uma semana do "Gastos por semana": os mesmos
 * lançamentos do gráfico (sem parcelas nem fixos, com os botões do topo),
 * do mais recente ao mais antigo, e quanto sobrou ou passou do target.
 */
function cardSemana(i, semanas){
  const w = semanas[i];
  if(!w) return;
  const ls = linhasDosGraficos().filter(l=>semanaDe(l, semanas)===i)
    .sort((a,b)=>(b.data?b.data.getTime():0)-(a.data?a.data.getTime():0) || b.valor-a.valor);
  const tot = ls.reduce((a,l)=>a+l.valor,0), livre = TARGET_SEMANA - tot;
  // com outro filtro (ou outro mês), mostra a mesma semana do mês aberto
  const box = abrirModal(()=>fecharModal(), ()=>{
    const sem = semanasDoMes(S.mesSel);
    sem[i] ? cardSemana(i, sem) : fecharModal();
  });
  box.innerHTML = `<div class="fx-ed">
    <div class="modal-topo">
      <h3><span class="fx-titulo">Semana</span> <span class="mes">${esc(w.rot)}</span></h3>
      <button type="button" class="modal-ic fx-x" title="Fechar" aria-label="Fechar">×</button>
    </div>
    <div class="sem-itens">${ls.length ? ls.map((l,k)=>`<button type="button" class="sem-it" data-ri="${k}">
        <span class="dt">${esc(diaCurto(l.data))}</span>
        ${l.conta?marca(l.conta,true):""}<span class="nm"></span><i class="tg-role">rolê</i><span class="vl">${esc(RS2(l.valor))}</span></button>`).join("")
      : `<div class="blank">Nenhuma compra nesta semana.</div>`}</div>
    <div class="role-pe"><button type="button" class="btn role-salvar" hidden></button></div>
    <div class="esoma"><span>Total da semana</span><span class="v">${esc(BRL.format(tot))}</span></div>
    <div class="esoma sub"><span>${livre>=0?"Ainda cabe no target":"Passou do target"}</span>
      <span class="v${livre<0?" neg":""}">${esc(BRL.format(Math.abs(livre)))}</span></div>
    <div class="fx-dica">Target da semana: ${esc(BRL.format(TARGET_SEMANA))}. Sem parcelas e sem fixos, como no gráfico. Toque numa compra para marcar ou desmarcar rolê.</div>
  </div>`;
  box.querySelectorAll(".sem-it .nm").forEach((el,k)=>{ el.textContent = ls[k].desc || "—"; });
  box.querySelector(".fx-x").onclick = fecharModal;
  ligarRolesToque(box, ls);
}

/** "01 - Sex": dia com dois dígitos e o dia da semana abreviado. */
const diaCurto = d => d ? `${p2(d.getDate())} - ${DIA_SEM[d.getDay()].charAt(0).toUpperCase()}${DIA_SEM[d.getDay()].slice(1)}` : "—";

/**
 * Marcar rolê tocando na compra (card da semana e dia do calendário).
 * A marcação fica pendente até o "Salvar" e então segue o mesmo caminho
 * do extrato: S.roles / S.rolesFora → salvarRoles (op "entertainment").
 * Desfazer um toque antes de salvar tira a compra da conta.
 */
function ligarRolesToque(box, ls){
  const pend = new Map();                     // chave → marcado
  const marcado = l => { const k = chaveRole(l); return pend.has(k) ? pend.get(k) : ehRole(l); };
  const linhasEl = [...box.querySelectorAll("[data-ri]")];
  const btn = box.querySelector(".role-salvar");
  const pintar = () => {
    linhasEl.forEach(el=>{
      const m = marcado(ls[+el.dataset.ri]);
      el.classList.toggle("role", m);
      el.setAttribute("aria-pressed", m ? "true" : "false");
      el.title = m ? "Rolê · toque para desmarcar" : "Toque para marcar como rolê";
    });
    if(btn){
      const n = pend.size;
      btn.hidden = !n;
      btn.textContent = `Salvar ${n} ${n===1?"alteração":"alterações"}`;
    }
  };
  linhasEl.forEach(el=>el.onclick = () => {
    const l = ls[+el.dataset.ri], k = chaveRole(l);
    const novo = !marcado(l);
    if(novo === ehRole(l)) pend.delete(k); else pend.set(k, novo);
    pintar();
  });
  if(btn) btn.onclick = () => {
    for(const [k, novo] of pend){
      // desmarcar registra exclusão, como no extrato
      if(novo){ S.roles.add(k); S.rolesFora.delete(k); }
      else    { S.roles.delete(k); S.rolesFora.add(k); }
      if(S.rolesMudados.has(k)){ if(S.rolesMudados.get(k) === novo) S.rolesMudados.delete(k); }
      else S.rolesMudados.set(k, !novo);
    }
    pend.clear();
    S.rolesSujo = S.rolesMudados.size > 0;
    salvarRoles();          // otimista: grava em segundo plano
    render();               // rolê do resumo, extrato e gráficos na hora
    pintar();
  };
  pintar();
}

/**
 * A média fica embaixo do total, do "R" ao "K": mesma largura do
 * total, letra bem pequena e espalhada por igual (justificada).
 */
function ajustarMedia(box){
  const tot = box.querySelector(".pz-tot"), med = box.querySelector(".pz-med");
  if(!tot || !med) return;
  const larg = tot.getBoundingClientRect().width;
  if(!larg) return;
  med.style.width = larg+"px";
  let fs = 10;
  med.style.fontSize = fs+"px";
  med.style.whiteSpace = "nowrap";
  // mede o texto no tamanho natural (sem a largura fixa) até caber
  med.style.width = "auto";
  while(med.getBoundingClientRect().width > larg + 0.5 && fs > 4){ fs -= 0.25; med.style.fontSize = fs+"px"; }
  med.style.width = larg+"px";
}

/** Marca o botão ativo do seletor de visualização de um gráfico. */
function marcarVis(alvo){
  document.querySelectorAll(`.vis-sel[data-vis="${alvo}"] button`).forEach(b=>
    b.setAttribute("aria-pressed", String(b.dataset.v===S.vis[alvo])));
}

/** Rótulo curto de competência para eixo X: "ago/26". */
const mesCurto = comp => {
  const [a,m] = String(comp||"").split("-").map(Number);
  return (a&&m) ? `${MES[m-1]}/${String(a).slice(2)}` : String(comp||"");
};

/** Apelido: dentro de grafico(), `esc` é a escala do eixo. */
const escHtml = esc;

/** Índices dos n maiores valores de uma série. */
function indicesDosPicos(valores, n){
  return valores.map((v,i)=>[Number(v)||0,i])
    .sort((a,b)=>b[0]-a[0])
    .slice(0,n)
    .map(([,i])=>i);
}

