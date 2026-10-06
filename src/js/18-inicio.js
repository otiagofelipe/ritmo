/* ═══════════ início ═══════════ */
(function(){
  let salvo = null;
  try{ salvo = localStorage.getItem("ritmo:tema-rw"); }catch(e){}
  aplicarTema(salvo || "retrowave");

  // no desktop estreito o menu já nasce recolhido
  if(window.innerWidth>760 && window.innerWidth<1100){
    document.body.classList.add("rail-min");
    $("rail-toggle").innerHTML = `<svg class="ic" viewBox="0 0 24 24"><use href="#i-right"/></svg>`;
  }

  render();   // desenha o estado vazio antes de buscar
  carregar();

  // o viewBox muda de proporção conforme a largura: redesenha ao girar
  let larguraAnterior = window.innerWidth;
  let relogioResize = null;
  window.addEventListener("resize", ()=>{
    // os gráficos usam a largura real: redesenha sempre que ela mudar
    // (a barra de endereço sumindo no celular muda só a altura e não conta)
    if(window.innerWidth === larguraAnterior) return;
    larguraAnterior = window.innerWidth;
    clearTimeout(relogioResize);
    relogioResize = setTimeout(render, 150);
  });

  document.addEventListener("visibilitychange", ()=>{
    if(document.visibilityState!=="visible") return;
    verificarCluster();
    // com formulário aberto, rebuscar apagaria o que está sendo digitado
    if(grupoAberto || S.editando) return;
    // ao voltar para o app, rebusca se passaram mais de 2 minutos
    if(Date.now()-ultimaCarga > 120000) carregar();
  });
})();
