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
 * Logotipos das contas, pela chave da conta (conta.id).
 *
 * Os arquivos ficam em public/img/bancos/: quadrados, 128×128 px. Para
 * uma conta nova, salve a imagem lá e acrescente uma linha aqui. Conta
 * sem linha (ou imagem que não carregar) fica com o selo da inicial.
 *
 * nubank e ticket já estão prontos para quando essas contas existirem.
 */
const LOGOS = {
  itau:   "/img/bancos/itau.png",
  picpay: "/img/bancos/picpay.png",
  caju:   "/img/bancos/caju.png",
  nubank: "/img/bancos/nubank.png",
  ticket: "/img/bancos/ticket.png"
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

/**
 * Catálogo da aba Cartões: as opções que dá para ligar e desligar.
 *
 *   id ....... chave estável (vai para bronze.ritmo.tb_cards.id_card e
 *              casa com CONTAS e LOGOS quando existe)
 *   tipo ..... "credito" ou "beneficio"
 *   bank ..... a instituição como vem na coluna bank da gold
 *   rotulo ... nome curto no Dashboard (VR, VA); sem rótulo vale o titulo
 *   padrao ... ligado quando ainda não há escolha gravada
 *
 * Quem não tem logo em LOGOS fica com o selo da inicial, na cor.
 */
const CATALOGO_CARTOES = [
  // crédito
  { id:"itau",         titulo:"Itaú",            tipo:"credito",   bank:"Itaú",            cor:"#EC7000", padrao:true },
  { id:"picpay",       titulo:"PicPay",          tipo:"credito",   bank:"PicPay",          cor:"#11C76F", padrao:true },
  { id:"nubank",       titulo:"Nubank",          tipo:"credito",   bank:"Nubank",          cor:"#820AD1" },
  { id:"bradesco",     titulo:"Bradesco",        tipo:"credito",   bank:"Bradesco",        cor:"#CC092F" },
  { id:"santander",    titulo:"Santander",       tipo:"credito",   bank:"Santander",       cor:"#EC0000" },
  { id:"bb",           titulo:"Banco do Brasil", tipo:"credito",   bank:"Banco do Brasil", cor:"#F2C500" },
  { id:"caixa",        titulo:"Caixa",           tipo:"credito",   bank:"Caixa",           cor:"#1C6FC9" },
  { id:"inter",        titulo:"Inter",           tipo:"credito",   bank:"Inter",           cor:"#FF7A00" },
  { id:"c6",           titulo:"C6 Bank",         tipo:"credito",   bank:"C6 Bank",         cor:"#9A9A9A" },
  { id:"mercadopago",  titulo:"Mercado Pago",    tipo:"credito",   bank:"Mercado Pago",    cor:"#00B1EA" },
  { id:"xp",           titulo:"XP",              tipo:"credito",   bank:"XP",              cor:"#E8C33A" },
  { id:"btg",          titulo:"BTG Pactual",     tipo:"credito",   bank:"BTG Pactual",     cor:"#4A78C2" },
  { id:"porto",        titulo:"Porto Bank",      tipo:"credito",   bank:"Porto Bank",      cor:"#0A6DD9" },
  { id:"neon",         titulo:"Neon",            tipo:"credito",   bank:"Neon",            cor:"#0EC5EC" },
  { id:"pagbank",      titulo:"PagBank",         tipo:"credito",   bank:"PagBank",         cor:"#00A868" },
  { id:"will",         titulo:"Will Bank",       tipo:"credito",   bank:"Will Bank",       cor:"#E8C400" },
  // benefícios
  { id:"caju",         titulo:"Caju",            tipo:"beneficio", bank:"Caju",            cor:"#E0A94A", rotulo:"VR", padrao:true },
  { id:"ticket",       titulo:"Ticket",          tipo:"beneficio", bank:"Ticket",          cor:"#E3171B", rotulo:"VA", padrao:true },
  { id:"vr",           titulo:"VR",              tipo:"beneficio", bank:"VR",              cor:"#00A859" },
  { id:"alelo",        titulo:"Alelo",           tipo:"beneficio", bank:"Alelo",           cor:"#1F9D55" },
  { id:"pluxee",       titulo:"Pluxee",          tipo:"beneficio", bank:"Pluxee",          cor:"#3D5AFE" },
  { id:"flash",        titulo:"Flash",           tipo:"beneficio", bank:"Flash",           cor:"#FF1E56" },
  { id:"ifood",        titulo:"iFood Benefícios",tipo:"beneficio", bank:"iFood Benefícios",cor:"#EA1D2C" },
  { id:"swile",        titulo:"Swile",           tipo:"beneficio", bank:"Swile",           cor:"#7D5CFF" }
];

/** O tipo como a bronze guarda (credit/benefit) e de volta. */
const TIPO_BRONZE = { credito:"credit", beneficio:"benefit" };

/** Cartão ligado: a última escolha gravada; sem escolha, o padrão do catálogo. */
function cartaoLigado(c){
  const g = (S.reg.cartoes || []).find(x => x.id === c.id);
  return g ? g.ligado : !!c.padrao;
}

/** Cartões de um tipo em ordem alfabética (sem diferença por acento ou maiúscula). */
const cartoesDoTipo = tipo => CATALOGO_CARTOES.filter(c => c.tipo === tipo)
  .sort((a,b) => a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity:"base" }));

/** Cartões ligados de um tipo, em ordem alfabética. */
const cartoesLigados = tipo => cartoesDoTipo(tipo).filter(cartaoLigado);

/**
 * Categorias de compra: a da Pluggy (em inglês) → a nossa, com emoji. É a
 * mesma lista da silver.ritmo.vw_category_map (sql/categorias.sql): a gold
 * pode mandar a categoria já traduzida ou ainda em inglês, as duas servem.
 * Categoria que não estiver aqui passa como veio.
 */
const CATEGORIAS = [
  ["Groceries","🛒 Mercado"], ["Food and drinks","🍽️ Alimentação e bebidas"], ["Eating out","🍴 Restaurantes"],
  ["Food delivery","🛵 Delivery"], ["Digital services","💻 Serviços digitais"], ["Services","🛠️ Serviços"],
  ["Shopping","🛍️ Compras"], ["Online shopping","📦 Compras online"], ["Clothing","👕 Roupas"],
  ["Electronics","🔌 Eletrônicos"], ["Houseware","🛋️ Casa e decoração"], ["Bookstore","📚 Livraria"],
  ["Sports goods","⚽ Artigos esportivos"], ["Leisure","🎉 Lazer"], ["Cinema, theater and concerts","🎬 Cinema, teatro e shows"],
  ["Tickets","🎟️ Ingressos"], ["Landmarks and museums","🏛️ Museus e pontos turísticos"], ["Gaming","🎮 Games"],
  ["Gambling","🎰 Apostas"], ["Lottery","🍀 Loteria"], ["Travel","✈️ Viagem"], ["Accomodation","🏨 Hospedagem"],
  ["Transportation","🚌 Transporte"], ["Public transportation","🚇 Transporte público"],
  ["Taxi and ride-hailing","🚕 Táxi e apps de corrida"], ["Car rental","🚙 Aluguel de carro"], ["Automotive","🚗 Automotivo"],
  ["Gas stations","⛽ Combustível"], ["Parking","🅿️ Estacionamento"], ["Tolls and in vehicle payment","🛣️ Pedágio e tag"],
  ["Vehicle maintenance","🔧 Manutenção do carro"], ["Housing","🏠 Moradia"], ["Rent","🔑 Aluguel"],
  ["Electricity","💡 Energia"], ["Water","💧 Água"], ["Internet","🌐 Internet"], ["Telecommunications","📱 Telefonia"],
  ["Healthcare","⚕️ Saúde"], ["Health insurance","🩺 Plano de saúde"], ["Hospital clinics and labs","🏥 Hospitais, clínicas e exames"],
  ["Pharmacy","💊 Farmácia"], ["Optometry","👓 Ótica"], ["Wellness and fitness","🏋️ Bem-estar e academia"],
  ["Insurance","🛡️ Seguros"], ["Credit card fees","💳 Tarifas do cartão"], ["Tax on financial operations","🧾 IOF"],
  ["Donations","💝 Doações"], ["Transfers","🔁 Transferências"], ["Transfer - PIX","⚡ Pix"],
  ["Third party transfer - PIX","💸 Pix para terceiros"], ["Transfer - Foreign Exchange","💱 Câmbio"]
];
const SEM_CATEGORIA = "❔ Sem categoria";
const CATEGORIA_PT = new Map(CATEGORIAS.map(([en, pt]) => [en.toLowerCase(), pt]));

/** Categoria da gold → a exibida (com emoji). Vazia vira "Sem categoria". */
function traduzirCategoria(c){
  const s = String(c||"").trim();
  if(!s || s.toLowerCase() === "null") return SEM_CATEGORIA;
  return CATEGORIA_PT.get(s.toLowerCase()) || s;
}

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

