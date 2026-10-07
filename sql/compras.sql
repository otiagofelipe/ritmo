/* ══════════════════════════════════════════════════════════════
   RITMO · Gerenciamento de cada compra (card da compra)

   Ao tocar numa compra da lista, abre um card com:
   - categoria (lista fixa da página)
   - marcações extras: gasto fixo (aqui) e rolê (continua na
     bronze.ritmo.tb_entertainment)
   - divisão: cada pessoa vira um Me devem na bronze.ritmo.tb_receivables
     que já existe, agora com o id_transaction da compra

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

-- ─── Me devem: passa a guardar a compra que gerou o registro ───
-- Estrutura completa, para o notebook guardar (não faz nada se a tabela já existe):
Create Table If Not Exists bronze.ritmo.tb_receivables (
    id_receivable        String,
    dt_start_month       Date,
    nm_person            String,
    nm_item              String,
    vl_amount            Decimal(12,2),
    qt_installments      Int,
    ls_paid_installments Array<Int>,
    id_transaction       String,
    fl_deleted           Boolean   Default False,
    ts_inserted          Timestamp Default Current_Timestamp()
)
Tblproperties (
    'delta.feature.allowColumnDefaults' = 'supported',
    'delta.columnMapping.mode' = 'name'
);
-- A tabela já existe com dados: a coluna nova entra sem recriar (as linhas antigas ficam com vazio).
Alter Table bronze.ritmo.tb_receivables Add Column id_transaction String After ls_paid_installments;

Comment On Column bronze.ritmo.tb_receivables.id_transaction Is 'id_transaction da compra dividida que gerou este Me devem (gold.prod.vw_ritmo). Vazio para registro anotado à mão.';


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

-- ─── Me devem: a view passa a levar o id_transaction ───
-- Mesma lógica de antes (versão mais recente por id, parcelas explodidas,
-- parcela paga pelo número em ls_paid_installments); só entra a coluna nova.
Create Or Replace View silver.ritmo.vw_receivables As
With atual As (
    Select *
    From bronze.ritmo.tb_receivables
    Qualify Row_Number() Over (Partition By id_receivable Order By ts_inserted Desc) = 1
),
parcelas As (
    Select
        a.*,
        nr_installment,
        Add_Months(a.dt_start_month, nr_installment - 1) As dt_installment_month
    From atual a
    Lateral View Explode(Sequence(1,
        Case
            When a.qt_installments = 0 Then Greatest(Cast(Months_Between(Date'2028-10-01', a.dt_start_month) As Int) + 1, 1)
            Else Greatest(Coalesce(a.qt_installments, 1), 1)
        End
    )) As nr_installment
    Where Not Coalesce(a.fl_deleted, False)
)
Select
    p.id_receivable,
    p.dt_start_month,
    p.dt_installment_month,
    p.nm_person,
    p.nm_item,
    -- piso nos centavos e a última parcela absorve a sobra: a soma fecha com o total
    Cast(Case
        When p.qt_installments = 0 Or Coalesce(p.qt_installments, 1) <= 1 Then p.vl_amount
        When p.nr_installment < p.qt_installments Then Floor(p.vl_amount * 100 / p.qt_installments) / 100
        Else p.vl_amount - Floor(p.vl_amount * 100 / p.qt_installments) / 100 * (p.qt_installments - 1)
    End As Decimal(12,2)) As vl_installment,
    p.vl_amount,
    p.nr_installment,
    p.qt_installments,
    Array_Contains(Coalesce(p.ls_paid_installments, Array()), p.nr_installment) As fl_paid,
    p.id_transaction,
    p.ts_inserted
From parcelas p;

Comment On Column silver.ritmo.vw_receivables.id_receivable        Is 'Identificador estável do lançamento original (repete entre parcelas).';
Comment On Column silver.ritmo.vw_receivables.dt_start_month       Is 'Mês de início da cobrança, sempre no dia 1 (aaaa-mm-01).';
Comment On Column silver.ritmo.vw_receivables.dt_installment_month Is 'Mês de competência da parcela, sempre no dia 1.';
Comment On Column silver.ritmo.vw_receivables.nm_person            Is 'Nome da pessoa que deve o valor.';
Comment On Column silver.ritmo.vw_receivables.nm_item              Is 'Nome ou descrição do item.';
Comment On Column silver.ritmo.vw_receivables.vl_installment       Is 'Valor da parcela em Reais. A última parcela absorve a diferença de centavos.';
Comment On Column silver.ritmo.vw_receivables.vl_amount            Is 'Valor total em Reais.';
Comment On Column silver.ritmo.vw_receivables.nr_installment       Is 'Número da parcela (1 até qt_installments).';
Comment On Column silver.ritmo.vw_receivables.qt_installments      Is 'Quantidade total de parcelas. 0 = recorrente, projetada até out/2028.';
Comment On Column silver.ritmo.vw_receivables.fl_paid              Is 'Indica se esta parcela foi paga.';
Comment On Column silver.ritmo.vw_receivables.id_transaction       Is 'Compra dividida que gerou o registro (vazio = anotado à mão).';
Comment On Column silver.ritmo.vw_receivables.ts_inserted          Is 'Data e hora (UTC) da versão atual do lançamento.';


/* ═══════════════ 3. CONFERÊNCIA ═══════════════ */

-- compras com categoria/gasto fixo escolhidos na página
Select * From silver.ritmo.vw_transaction_details Order By dt_transaction Desc;

-- Me devem que vieram da divisão de uma compra
Select r.dt_start_month, r.nm_item, r.nm_person, r.vl_installment, r.id_transaction
From silver.ritmo.vw_receivables r
Where r.id_transaction Is Not Null
Order By r.dt_start_month Desc;



/* ═══════════════ 4. LIMPEZA DA PRIMEIRA VERSÃO — rodar DEPOIS do merge ═══════════════

   Até o merge, o site no ar ainda lê vw_transaction_splits e
   vw_categories: apagá-las antes faz aparecer o aviso de "parte dos
   dados não carregou".

   A primeira versão do card guardava o vínculo em tb_transaction_splits
   e as categorias criadas em tb_categories; as duas saem.
   - O Insert grava uma versão nova de cada Me devem dividido, agora com
     o id_transaction. Se nunca dividiu nenhuma compra, pode pular.
   - Os Drop apagam as tabelas e views que não são mais usadas. */

Insert Into bronze.ritmo.tb_receivables
    (id_receivable, dt_start_month, nm_person, nm_item, vl_amount, qt_installments, ls_paid_installments, id_transaction, fl_deleted)
Select
    r.id_receivable, r.dt_start_month, r.nm_person, r.nm_item, r.vl_amount, r.qt_installments,
    r.ls_paid_installments, s.id_transaction, r.fl_deleted
From (
    Select *
    From bronze.ritmo.tb_receivables
    Qualify Row_Number() Over (Partition By id_receivable Order By ts_inserted Desc) = 1
) r
Join silver.ritmo.vw_transaction_splits s On s.id_receivable = r.id_receivable
Where r.id_transaction Is Null;

Drop View If Exists silver.ritmo.vw_transaction_splits;
Drop Table If Exists bronze.ritmo.tb_transaction_splits;
Drop View If Exists silver.ritmo.vw_categories;
Drop Table If Exists bronze.ritmo.tb_categories;
