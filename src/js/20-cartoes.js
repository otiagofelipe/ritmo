/* ═══════════ Cartões ═══════════

   Liga e desliga os cartões que aparecem no acompanhamento. A lista de
   opções é o CATALOGO_CARTOES (01-config); a escolha vai para
   bronze.ritmo.tb_cards, uma linha por clique, e volta pela
   silver.ritmo.vw_cards. A tela muda na hora; se a gravação falhar,
   o cartão volta ao estado anterior e aparece o aviso. */

/** Texto sem acento e em minúsculas, para comparar nomes de banco. */
function semAcento(s){
  return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Quantos lançamentos a gold tem desse banco (em todas as competências). */
function lancamentosDoBanco(c){
  const alvo = semAcento(c.bank);
  return (S.consolidado || []).filter(l => semAcento(l.metodo) === alvo).length;
}

function pgCartoes(){
  for(const tipo of ["credito","beneficio"]){
    const lista = CATALOGO_CARTOES.filter(c => c.tipo === tipo);
    const ligados = lista.filter(cartaoLigado).length;
    $("ct-n-"+tipo).textContent = `${ligados} de ${lista.length} ligado${ligados===1?"":"s"}`;
    $("ct-"+tipo).innerHTML = lista.map(c => {
      const on = cartaoLigado(c);
      const n = lancamentosDoBanco(c);
      const nota = n ? `${n} lançamento${n>1?"s":""}` : "sem dados ainda";
      return `<button type="button" class="ct-item${on?" on":""}" role="switch" aria-checked="${on}" data-cartao="${esc(c.id)}">
        ${marca(c)}
        <span class="ct-nome"><b>${esc(c.titulo)}</b><small class="${n?"tem":""}">${esc(nota)}</small></span>
        <span class="ct-chave" aria-hidden="true"><i></i></span>
      </button>`;
    }).join("");
  }
  document.querySelectorAll("#pg-cartoes [data-cartao]").forEach(b =>
    b.onclick = () => alternarCartao(b.dataset.cartao));
}

async function alternarCartao(id){
  const c = CATALOGO_CARTOES.find(x => x.id === id);
  if(!c) return;
  const antes = (S.reg.cartoes || []).slice();
  const ligado = !cartaoLigado(c);
  S.reg.cartoes = antes.filter(x => x.id !== id).concat({ id, ligado });
  render();
  try{
    await api("/salvar", { op:"cartoes", linhas:[{
      id_card: c.id, nm_card: c.titulo, tp_card: TIPO_BRONZE[c.tipo], nm_bank: c.bank, fl_enabled: ligado
    }]});
  }catch(e){
    S.reg.cartoes = antes;
    render();
    banner("err", `Não consegui gravar o cartão no Databricks: ${esc(e.message)}`);
  }
}
