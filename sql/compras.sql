/* ══════════════════════════════════════════════════════════════
   RITMO · Gerenciamento de cada compra (card da compra)

   Ao tocar numa compra da lista, abre um card com:
   - categoria (lista fixa da página + as que você criar)
   - marcações extras: gasto fixo (aqui) e rolê (continua na
     bronze.ritmo.tb_entertainment)
   - divisão: cada pessoa vira um Me devem (bronze.ritmo.tb_receivables)
     e o vínculo com a compra fica em tb_transaction_splits

   Todas só com inserção: mudar grava uma versão nova; a silver mostra
   a mais recente. A compra é cruzada pelo id_transaction da gold. Como
   o Open Finance às vezes troca esse id, cada linha também guarda
   descrição, valor e dia da compra: a página usa esse trio quando o id
   não casa mais.

   Rodar na ordem: as silvers leem as bronzes.
   ══════════════════════════════════════════════════════════════ */


/* ═══════════════ 1. BRONZE ═══════════════ */

-- ─── Categoria e gasto fixo de cada compra ───
Create Table If Not Exists bronze.ritmo.tb_transaction_details (
    id_transaction   String,
    nm_merchant      String,
    vl_amount        Decimal(12,2),
    dt_transaction   Date,
    nm_category      String,
    fl_fixed_expense Boolean,
    ts_inserted      Timestamp Default Current_Timestamp()
)
Tblproperties (
    'delta.feature.allowColumnDefaults' = 'supported',
    'delta.columnMapping.mode' = 'name'
);

Comment On Column bronze.ritmo.tb_transaction_details.id_transaction   Is 'id_transaction da gold.prod.vw_ritmo.';
Comment On Column bronze.ritmo.tb_transaction_details.nm_merchant      Is 'Descrição da compra, para casar quando o id_transaction mudar.';
Comment On Column bronze.ritmo.tb_transaction_details.vl_amount        Is 'Valor da compra em Reais, para casar quando o id_transaction mudar.';
Comment On Column bronze.ritmo.tb_transaction_details.dt_transaction   Is 'Dia da compra, para casar quando o id_transaction mudar.';
Comment On Column bronze.ritmo.tb_transaction_details.nm_category      Is 'Categoria escolhida na página. Vazio = a categoria da gold, traduzida.';
Comment On Column bronze.ritmo.tb_transaction_details.fl_fixed_expense Is 'Marcação de gasto fixo: true, false, ou vazio = automático (casamento com o cadastro de Gastos fixos).';
Comment On Column bronze.ritmo.tb_transaction_details.ts_inserted      Is 'Data e hora (UTC) em que o registro foi inserido na plataforma.';

-- ─── Divisão: vínculo entre a compra e cada Me devem que ela gerou ───
Create Table If Not Exists bronze.ritmo.tb_transaction_splits (
    id_transaction String,
    nm_merchant    String,
    vl_amount      Decimal(12,2),
    dt_transaction Date,
    id_receivable  String,
    fl_deleted     Boolean   Default False,
    ts_inserted    Timestamp Default Current_Timestamp()
)
Tblproperties (
    'delta.feature.allowColumnDefaults' = 'supported',
    'delta.columnMapping.mode' = 'name'
);

Comment On Column bronze.ritmo.tb_transaction_splits.id_transaction Is 'id_transaction da compra dividida (gold.prod.vw_ritmo).';
Comment On Column bronze.ritmo.tb_transaction_splits.nm_merchant    Is 'Descrição da compra, para casar quando o id_transaction mudar.';
Comment On Column bronze.ritmo.tb_transaction_splits.vl_amount      Is 'Valor da compra em Reais (a compra inteira, não a parte da pessoa).';
Comment On Column bronze.ritmo.tb_transaction_splits.dt_transaction Is 'Dia da compra.';
Comment On Column bronze.ritmo.tb_transaction_splits.id_receivable  Is 'id_receivable do Me devem gerado para uma pessoa (bronze.ritmo.tb_receivables).';
Comment On Column bronze.ritmo.tb_transaction_splits.fl_deleted     Is 'Indica que esta versão desfaz o vínculo.';
Comment On Column bronze.ritmo.tb_transaction_splits.ts_inserted    Is 'Data e hora (UTC) em que o registro foi inserido na plataforma.';

-- ─── Categorias criadas na página (as fixas moram no código) ───
Create Table If Not Exists bronze.ritmo.tb_categories (
    id_category String,
    nm_category String,
    fl_deleted  Boolean   Default False,
    ts_inserted Timestamp Default Current_Timestamp()
)
Tblproperties (
    'delta.feature.allowColumnDefaults' = 'supported',
    'delta.columnMapping.mode' = 'name'
);

Comment On Column bronze.ritmo.tb_categories.id_category Is 'Identificador estável da categoria (nome sem acento, minúsculo, com hífen).';
Comment On Column bronze.ritmo.tb_categories.nm_category Is 'Nome da categoria como aparece na página.';
Comment On Column bronze.ritmo.tb_categories.fl_deleted  Is 'Indica que esta versão remove a categoria.';
Comment On Column bronze.ritmo.tb_categories.ts_inserted Is 'Data e hora (UTC) em que o registro foi inserido na plataforma.';


/* ═══════════════ 2. SILVER ═══════════════ */

-- ─── Detalhes: a versão mais recente de cada compra ───
Create Or Replace View silver.ritmo.vw_transaction_details As
Select
    id_transaction,
    nm_merchant,
    vl_amount,
    dt_transaction,
    nm_category,
    fl_fixed_expense,
    ts_inserted
From bronze.ritmo.tb_transaction_details
Qualify Row_Number() Over (
    Partition By Coalesce(id_transaction, Concat_Ws('|', Lower(Trim(nm_merchant)), Cast(vl_amount As String), Cast(dt_transaction As String)))
    Order By ts_inserted Desc
) = 1;

Comment On Column silver.ritmo.vw_transaction_details.id_transaction   Is 'id_transaction da gold.prod.vw_ritmo.';
Comment On Column silver.ritmo.vw_transaction_details.nm_merchant      Is 'Descrição da compra.';
Comment On Column silver.ritmo.vw_transaction_details.vl_amount        Is 'Valor da compra em Reais.';
Comment On Column silver.ritmo.vw_transaction_details.dt_transaction   Is 'Dia da compra.';
Comment On Column silver.ritmo.vw_transaction_details.nm_category      Is 'Categoria escolhida na página (vazio = a da gold).';
Comment On Column silver.ritmo.vw_transaction_details.fl_fixed_expense Is 'Gasto fixo: true, false ou vazio = automático.';
Comment On Column silver.ritmo.vw_transaction_details.ts_inserted      Is 'Data e hora (UTC) da versão atual.';

-- ─── Divisões: vínculos ativos (um por Me devem) ───
Create Or Replace View silver.ritmo.vw_transaction_splits As
With atual As (
    Select *
    From bronze.ritmo.tb_transaction_splits
    Qualify Row_Number() Over (Partition By id_receivable Order By ts_inserted Desc) = 1
)
Select
    id_transaction,
    nm_merchant,
    vl_amount,
    dt_transaction,
    id_receivable,
    ts_inserted
From atual
Where Not Coalesce(fl_deleted, False);

Comment On Column silver.ritmo.vw_transaction_splits.id_transaction Is 'id_transaction da compra dividida.';
Comment On Column silver.ritmo.vw_transaction_splits.nm_merchant    Is 'Descrição da compra.';
Comment On Column silver.ritmo.vw_transaction_splits.vl_amount      Is 'Valor da compra inteira em Reais.';
Comment On Column silver.ritmo.vw_transaction_splits.dt_transaction Is 'Dia da compra.';
Comment On Column silver.ritmo.vw_transaction_splits.id_receivable  Is 'Me devem gerado (silver.ritmo.vw_receivables.id_receivable).';
Comment On Column silver.ritmo.vw_transaction_splits.ts_inserted    Is 'Data e hora (UTC) da versão atual do vínculo.';

-- ─── Categorias criadas na página ───
Create Or Replace View silver.ritmo.vw_categories As
With atual As (
    Select *
    From bronze.ritmo.tb_categories
    Qualify Row_Number() Over (Partition By id_category Order By ts_inserted Desc) = 1
)
Select
    id_category,
    nm_category,
    ts_inserted
From atual
Where Not Coalesce(fl_deleted, False);

Comment On Column silver.ritmo.vw_categories.id_category Is 'Identificador estável da categoria.';
Comment On Column silver.ritmo.vw_categories.nm_category Is 'Nome da categoria como aparece na página.';
Comment On Column silver.ritmo.vw_categories.ts_inserted Is 'Data e hora (UTC) da versão atual.';


/* ═══════════════ 3. CONFERÊNCIA ═══════════════ */

-- compras com categoria/gasto fixo escolhidos na página
Select * From silver.ritmo.vw_transaction_details Order By dt_transaction Desc;

-- cada divisão com a pessoa e o valor do Me devem
Select s.dt_transaction, s.nm_merchant, s.vl_amount, r.nm_person, r.vl_installment
From silver.ritmo.vw_transaction_splits s
Join silver.ritmo.vw_receivables r On r.id_receivable = s.id_receivable
Order By s.dt_transaction Desc;

Select * From silver.ritmo.vw_categories;
