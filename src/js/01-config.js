"use strict";

/* ══════════════════════════════════════════════════════════
   CONFIGURAÇÃO

   Os dados vêm do Databricks por um Cloudflare Worker:
     GET  /api/dados   → transações (gold.prod.vw_ritmo) e os registros
                         manuais (silver.ritmo.vw_*)
     POST /api/salvar  → grava na bronze

   Colunas da gold.prod.vw_ritmo:
     id_bill ............ id da fatura: o uuid quando já fechou; o mês
                          (aaaa-mm-01) enquanto ainda não tem id
     nm_merchant ........ descrição do lançamento
     vl_amount .......... valor; positivo = saída
     ts_transaction ..... quando a compra aconteceu (data e hora,
                          horário de Brasília)
     dt_billing_month ... competência da fatura (aaaa-mm-01)
     dt_considered ...... dia considerado (compra até meio-dia = véspera)
     bank ............... "Itaú", "PicPay", "Caju"
     card ............... "ITAU AZUL VISA GOLD", "PICPAY MASTERCARD BLACK"…
     tp_operation ....... "Crédito", "Pix"
     category ........... categoria
     id_transaction ..... id único
     status ............. POSTED / PENDING / PROJECTED / CORRECTED
     nr_installment / qt_installments
     ds_billing_week .... "27/07 - 02/08"
     nm_source .......... pluggy ou ritmo
     fl_entertainment ... rolê (quando existir na gold)
   ══════════════════════════════════════════════════════════ */

/** Worker que fala com o Databricks: o mesmo que serve a página, então o caminho é relativo. */
const API = "/api";

/** Renda mensal, usada no "posso gastar". */
/**
 * Entrada padrão, usada enquanto a aba Entradas estiver vazia. Assim
 * que existir uma faixa cadastrada, ela manda.
 */
const RENDA = [4320, 3702.39];

/**
 * Quanto entra numa competência.
 *
 * As faixas de entrada têm vigência como as contas fixas: um aumento
 * em abril não deve reescrever o salário de março. Vale a faixa de
 * início mais recente que cobre a competência.
 */
function rendaDe(mes){
  const alvo = mes || S.mesSel;
  /* Uma entrada por competência. Mês sem lançamento herda o último
     anterior — senão todo mês ainda não preenchido apareceria zerado
     no gráfico, o que seria pior do que repetir o valor conhecido. */
  const anteriores = (S.reg.entradas || [])
    .filter(e=>mesDaEntrada(e) && mesDaEntrada(e) <= alvo)
    .sort((a,b)=>mesDaEntrada(a).localeCompare(mesDaEntrada(b)));
  const f = anteriores[anteriores.length-1];

  if(!f) return {
    parte1: RENDA[0]||0, parte2: RENDA[1]||0, caju: TETO_CAJU,
    acrescimos: 0, descontos: 0,
    total: RENDA.reduce((a,v)=>a+v,0) + TETO_CAJU, padrao:true
  };

  const n = v => Number(v)||0;
  // desconto entra sempre negativo, digitado com sinal ou sem
  const desc = -Math.abs(n(f.descontos));
  // "outros" era o nome antigo do campo de acréscimos
  const acr = n(f.acrescimos !== undefined && f.acrescimos !== "" ? f.acrescimos : f.outros);
  return {
    parte1:n(f.parte1), parte2:n(f.parte2), caju:n(f.caju),
    acrescimos:acr, descontos:desc,
    total: n(f.parte1)+n(f.parte2)+n(f.caju)+acr+desc,
    padrao:false
  };
}

/**
 * A competência de uma entrada.
 *
 * Vive na coluna `competencia`. A coluna `mes` NÃO serve: ela é o
 * balde do grupo e vale "*" em toda linha — lê-la primeiro fazia todo
 * mês virar "*". `inicio` é aceito para ler o que foi gravado antes
 * da coluna existir.
 */
const mesDaEntrada = e => {
  for(const v of [e.competencia, e.inicio, e.mes]){
    const m = String(v||"").trim().match(/^\d{4}-\d{2}/);
    if(m) return m[0];
  }
  return "";
};

/**
 * O que sobra do vale por fora do salário em dinheiro: o Caju é a
 * única entrada que não dá para gastar em qualquer lugar, então ele
 * entra na conta como teto próprio.
 */
const tetoCaju = mes => rendaDe(mes).caju;

/** Salário em dinheiro: tudo menos o vale. */
const salarioDe = mes => {
  const r = rendaDe(mes);
  return r.parte1 + r.parte2 + r.acrescimos + r.descontos;
};

/**
 * Logotipos das contas.
 *
 * Vem vazio de propósito: os logos do Itaú, do PicPay e do Caju são
 * marcas registradas e não acompanham este arquivo. Cole aqui a URL
 * da imagem ou um data URI ("data:image/svg+xml;base64,...") e o app
 * passa a desenhar a imagem no lugar da letra. O que ficar vazio
 * continua com o selo de inicial.
 */
const LOGOS = {
  itau:   "https://upload.wikimedia.org/wikipedia/commons/2/2d/2023_Ita%C3%BA_Unibanco_Logo.png?utm_source=pt.wikipedia.org&utm_campaign=index&utm_content=original",
  picpay: "https://static.wikia.nocookie.net/logopedia/images/b/b5/Picpayicon.jpg/revision/latest?cb=20181222023507",
  caju:   "https://play-lh.googleusercontent.com/gZ30d07fvm6p_2kW3-2wiOfTI3MtzQkAZWwzvUs0MhaNUS8cgUDmLtJnIc1bkq-qIUDRvMautvrfvwebE5v7"
};

/** Referência semanal de gasto, desenhada no gráfico por semana. */
const TARGET_SEMANA = 600;

/** Teto do vale do Caju. */
const TETO_CAJU = 1500;

/**
 * Quadros que você mesmo preenche. Para criar outro, acrescente uma
 * linha aqui: card, formulário e gravação saem prontos.
 *
 *   campos ......... nome, valor, data (dia cheio), dia (só o número),
 *                    mesInicio (competência da 1ª parcela),
 *                    parcelas (divide o valor pelos meses seguintes),
 *                    apelido (nome bonito, só para exibição),
 *                    vigencia (início e término de uma conta fixa),
 *                    pago, terceiro,
 *                    cobranca (onde a conta fixa é paga: "picpay" ou "pix")
 *   soAdiciona ..... o formulário abre em branco; o que já existe aparece no extrato
 *   todosOsMeses ... vale para toda competência, não só a aberta
 */
const GRUPOS = [
  { id:"devem", titulo:"Me devem", cor:"#3FBF8F", alvo:"m-editor-devem", duasLinhas:true,
    campos:["nome","valor","mesInicio","parcelas"],
    rotulos:{nome:"Nome", valor:"Valor total", mesInicio:"1ª parcela"} },
  { id:"devo",  titulo:"Eu devo",  cor:"#F0685E", alvo:"m-editor-devo", duasLinhas:true,
    campos:["nome","valor","mesInicio","parcelas"],
    rotulos:{nome:"Nome", valor:"Valor total", mesInicio:"1ª parcela"} },
  { id:"caju2", titulo:"Lançar no Caju", cor:"#E0A94A", semCard:true, duasLinhas:true,
    grupoPlanilha:"caju", soAdiciona:true, alvo:"m-editor",
    campos:["nome","valor","data"],
    rotulos:{nome:"Estabelecimento", valor:"Valor", data:"Data"} },
  { id:"entradas", titulo:"Entradas", cor:"#3FBF8F", semCard:true,
    todosOsMeses:true, alvo:"m-editor-entradas", campos:[] },
  { id:"fixos", titulo:"Contas fixas", cor:"#A6A9C6", semCard:true, duasLinhas:true,
    todosOsMeses:true, alvo:"m-editor-fixas",
    campos:["nome","apelido","valor","dia","vigencia","terceiro","cobranca"],
    rotulos:{nome:"Na fatura", apelido:"Exibir como", valor:"Valor", dia:"Dia"} }
];

/**
 * Como cada forma de pagamento aparece na tela.
 * `padrao` casa com o bank da planilha.
 */
const CONTAS = [
  { id:"itau",   titulo:"Itaú",   cor:"#6FA8E8", padrao:/^Itaú/i,   limite:0 },
  { id:"picpay", titulo:"PicPay", cor:"#8B7BF0", padrao:/^PicPay/i, limite:0 },
  { id:"caju",   titulo:"Caju",   cor:"#E0A94A", padrao:/^caju$/i,  temTeto:true }
];

/** Ordem dos quadrados na tela. Mistura cartões e quadros anotados. */
const ORDEM_CARDS = ["itau","picpay","devo","devem","caju"];

/**
 * Contas correntes não têm fatura: entram no extrato pela data, mas
 * ficam fora dos cards de cartão e do total, porque um Pix enviado
 * costuma ser transferência, não gasto novo.
 *
 * Agora que bank e card vêm separados, o que identifica a conta é o
 * operation_type: tudo que não é crédito veio da conta. O Caju não
 * traz operation_type e fica de fora da regra.
 */
const ehContaCorrente = (banco, cartao, operacao) =>
  // Caju é vale: a CONSOLIDADO manda operation_type "Caju", que não é
  // crédito, mas também não é conta corrente
  !/^caju$/i.test(String(banco||"").trim()) && (
  /conta|corrente|checking/i.test(cartao) ||
  (!!operacao && !/cr[ée]dito|credit/i.test(operacao)));

/**
 * Faturas ainda não fechadas.
 *
 * O pipeline antes marcava a fatura aberta com bill_id = "Atual".
 * Agora ele grava a própria competência ali — o mês corrente e, quando
 * a virada ainda não fechou a anterior, o mês passado também. As duas
 * formas são aceitas: uuid é fatura fechada, qualquer coisa com cara
 * de aaaa-mm (ou o literal "Atual") é fatura em aberto.
 *
 * Isso importa porque uma compra feita depois do fechamento nasce com
 * bill_month do mês seguinte; é o bill_id que diz em qual fatura ela
 * cai de verdade.
 */
const BILL_ABERTA = "Atual";
const ehBillAberta = id => {
  const t = String(id||"").trim();
  return t === BILL_ABERTA || /^\d{4}-\d{2}(-\d{2})?$/.test(t);
};

/** Competência que um bill_id em aberto representa, quando ele traz o mês. */
const mesDoBill = id => {
  const m = String(id||"").trim().match(/^(\d{4}-\d{2})/);
  return m ? m[1] : "";
};

/**
 * Pagamento de fatura não é gasto: é a quitação do que já foi
 * lançado compra a compra. Aparece com valor negativo e infla a
 * conta ao contrário se entrar. Estornos e reduções continuam,
 * porque esses de fato abatem o que foi gasto.
 */
const EH_PAGAMENTO = /(pagamento (de |com )?(fatura|saldo)|pagamento recebido|credit card payment)/i;

