/* ══════════════════════════════════════════════════════════════
   RITMO · Cartões habilitados (aba Cartões)

   A página guarda quais cartões aparecem no acompanhamento. Cada
   vez que um cartão é ligado ou desligado entra uma linha nova na
   bronze (só inserção); a silver mostra a versão mais recente de
   cada cartão.

   A lista de opções (Nubank, Itaú, Caju, Ticket…) mora no código da
   página. Aqui ficam só as escolhas. Cartão sem nenhuma linha usa o
   padrão da página (hoje: Itaú, PicPay, Caju e Ticket ligados).

   Rodar na ordem: a silver lê a bronze.
   ══════════════════════════════════════════════════════════════ */


/* ═══════════════ 1. BRONZE ═══════════════ */

Create Table If Not Exists bronze.ritmo.tb_cards (
    id_card     String,
    nm_card     String,
    tp_card     String,
    nm_bank     String,
    fl_enabled  Boolean,
    ts_inserted Timestamp Default Current_Timestamp()
)
Tblproperties (
    'delta.feature.allowColumnDefaults' = 'supported',
    'delta.columnMapping.mode' = 'name'
);

Comment On Column bronze.ritmo.tb_cards.id_card     Is 'Identificador estável do cartão no catálogo da página (ex.: nubank, itau, caju).';
Comment On Column bronze.ritmo.tb_cards.nm_card     Is 'Nome do cartão como aparece na página.';
Comment On Column bronze.ritmo.tb_cards.tp_card     Is 'Tipo do cartão: credit (cartão de crédito) ou benefit (vale/benefício).';
Comment On Column bronze.ritmo.tb_cards.nm_bank     Is 'Instituição, no mesmo texto da coluna bank da gold.prod.vw_ritmo (ex.: Itaú, PicPay, Caju).';
Comment On Column bronze.ritmo.tb_cards.fl_enabled  Is 'Indica se o cartão aparece no acompanhamento. Vale a versão mais recente.';
Comment On Column bronze.ritmo.tb_cards.ts_inserted Is 'Data e hora (UTC) em que o registro foi inserido na plataforma.';


/* ═══════════════ 2. SILVER ═══════════════ */

Create Or Replace View silver.ritmo.vw_cards As
Select
    id_card,
    nm_card,
    tp_card,
    nm_bank,
    fl_enabled,
    ts_inserted
From bronze.ritmo.tb_cards
Qualify Row_Number() Over (Partition By id_card Order By ts_inserted Desc) = 1;

Comment On Column silver.ritmo.vw_cards.id_card     Is 'Identificador estável do cartão no catálogo da página.';
Comment On Column silver.ritmo.vw_cards.nm_card     Is 'Nome do cartão como aparece na página.';
Comment On Column silver.ritmo.vw_cards.tp_card     Is 'Tipo do cartão: credit (cartão de crédito) ou benefit (vale/benefício).';
Comment On Column silver.ritmo.vw_cards.nm_bank     Is 'Instituição, no mesmo texto da coluna bank da gold.prod.vw_ritmo.';
Comment On Column silver.ritmo.vw_cards.fl_enabled  Is 'Indica se o cartão aparece no acompanhamento (última escolha).';
Comment On Column silver.ritmo.vw_cards.ts_inserted Is 'Data e hora (UTC) da última escolha.';


/* ═══════════════ 3. CONFERÊNCIA ═══════════════ */

-- uma linha por cartão que já foi ligado ou desligado alguma vez
Select * From silver.ritmo.vw_cards Order By tp_card, nm_card;
