/* ═══════════ versão ═══════════
   Canto superior direito: quando esta versão foi publicada (horário de
   Brasília) e de qual commit. Serve para conferir se a página que está
   aberta é mesmo a última — o celular às vezes segura a antiga. */
(function(){
  const v = typeof __RITMO_VERSAO__ !== "undefined" ? __RITMO_VERSAO__ : null;
  const el = $("versao");
  if(!el || !v) return;
  const d = new Date(v.quando);
  const fmt = o => d.toLocaleString("pt-BR", Object.assign({ timeZone:"America/Sao_Paulo" }, o));
  const curto = `${fmt({day:"2-digit", month:"2-digit"})} ${fmt({hour:"2-digit", minute:"2-digit"})}`;
  el.textContent = `v ${curto} · ${v.commit}`;
  el.title = `Publicado em ${fmt({dateStyle:"short", timeStyle:"short"})} · commit ${v.commit}`;
})();
