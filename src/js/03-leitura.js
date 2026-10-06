/* ─────────── leitura do Databricks ─────────── */

const ehVerdade = v => /^(true|verdadeiro|sim|1)$/i.test(String(v||"").trim());
const mesDe = d => d ? `${d.getFullYear()}-${p2(d.getMonth()+1)}` : "";

/**
 * Transforma as linhas da gold.prod.vw_ritmo no formato que o
 * dashboard usa. O Worker devolve objetos { coluna: valor } com tudo
 * em texto; a hora de ts_transaction já vem no horário de Brasília.
 */
function ingerir(registros){
  if(!Array.isArray(registros)) throw new Error("A resposta não trouxe transações.");
  const saida = [];
  const rotulos = {};   // "2026-09" → "Setembro - Out/26" (ds_billing_month da gold)

  for(const r of registros){
    const compRotulo = mesDe(parseData(r.dt_billing_month));
    const rotulo = String(r.ds_billing_month||"").trim();
    if(compRotulo && rotulo && !rotulos[compRotulo]) rotulos[compRotulo] = rotulo;

    // bank é a instituição (Itaú, PicPay, Caju) e é por ele que o
    // lançamento cai no card; card é o plástico, só rótulo.
    const metodo = String(r.bank||"").trim();
    if(!metodo) continue;
    const cartao = String(r.card||"").trim();

    const descricao = String(r.nm_merchant||"").trim();
    const categoria = String(r.category||"").trim();
    if(EH_PAGAMENTO.test(descricao) || EH_PAGAMENTO.test(categoria)) continue;

    const conta = CONTAS.find(c=>c.padrao.test(metodo)) || null;
    const dataMov = parseData(r.ts_transaction) || parseData(r.dt_considered);
    if(!dataMov) continue;

    const parcAtual = parseInt(r.nr_installment,10);
    const parcTotal = parseInt(r.qt_installments,10);
    const opTipo = String(r.tp_operation||"").trim();

    saida.push({
      id: String(r.id_transaction||"").trim() || (metodo+"|"+cartao+"|"+descricao+"|"+r.ts_transaction),
      competencia: mesDe(parseData(r.dt_billing_month)),   // ajustada abaixo pelo id_bill
      billId: String(r.id_bill||"").trim(),
      desc: descricao,
      valor: Number(r.vl_amount)||0,
      data: dataMov,
      hora: horaDe(r.ts_transaction),
      dataFatura: dataMov,
      metodo,
      cartao,
      conta,                                     // null quando não é conta conhecida
      contaCorrente: ehContaCorrente(metodo, cartao, opTipo),
      operacao: opTipo,
      // Pix é o que o tp_operation diz que é, e mais nada. Casar
      // "pix" na descrição pegava compra de loja com Pix no nome.
      pix: opTipo.toUpperCase() === "PIX",
      categoria,
      status: String(r.status||"").trim(),
      // rolê vem da gold quando a coluna existir; até lá, só a marcação da tela
      role: ehVerdade(r.fl_entertainment),
      // a gold não marca conta fixa: quem identifica é o casamento por
      // nome com o cadastro de Gastos fixos (idsCobrancasFixas)
      fixa: false,
      semana: String(r.ds_billing_week||"").trim(),
      parcela: (parcAtual && parcTotal) ? {i:parcAtual, n:parcTotal} : null
    });
  }

  S.rotulosFatura = rotulos;
  S.mesAberto = descobrirMesAberto(saida);

  /* A competência é a da gold (dt_billing_month, o mesmo mês do
     ds_billing_month) e não muda quando a fatura fecha e o id_bill
     troca de "aaaa-mm-01" para o uuid da fatura. Só sem mês na gold é
     que o id_bill em aberto serve de reserva. */
  for(const l of saida)
    if(!l.competencia) l.competencia = mesDoBill(l.billId) || S.mesAberto;

  S.consolidado = saida;
}

/**
 * Registros manuais (silver) no formato de S.reg que o dashboard já
 * usa. Os nomes internos (nome, pessoa, pagos…) continuam os mesmos:
 * só a origem mudou.
 */
function ingerirRegistros(d){
  const txt = v => String(v==null?"":v).trim();
  const num = v => Number(v)||0;
  const comp = v => { const m = txt(v).match(/^\d{4}-\d{2}/); return m ? m[0] : ""; };

  /* Me devem / Eu devo: a bronze guarda os NÚMEROS das parcelas pagas;
     o HTML trabalha com os MESES pagos. A conversão é o mês de início
     mais (número − 1). */
  const divida = r => {
    const inicio = comp(r.dt_start_month);
    const pagos = txt(r.ls_paid_installments).split(";").filter(Boolean)
      .map(n => somaMeses(inicio, Number(n)-1)).filter(Boolean);
    return {
      id: txt(r.id),
      mes: inicio,                       // balde do registro: o mês em que começa
      mesInicio: inicio,
      pessoa: txt(r.nm_person),
      nome: txt(r.nm_item) || txt(r.nm_person),
      valor: num(r.vl_amount),
      parcelas: Math.max(0, Math.round(num(r.qt_installments))),
      pagos: pagos.join(";"),
      pago: false,
      terceiro: false, data: ""
    };
  };

  S.reg = {
    devem: (d.devem||[]).map(divida),
    devo:  (d.devo||[]).map(divida),
    fixos: (d.fixos||[]).map(r => ({
      id: txt(r.id_fixed_expense),
      mes: "*",
      nome: txt(r.nm_invoice),
      apelido: txt(r.nm_alias),
      valor: num(r.vl_amount),
      data: r.nr_day==null || r.nr_day==="" ? "" : String(Math.round(num(r.nr_day))),
      terceiro: ehVerdade(r.fl_third_party),
      inicio: comp(r.dt_start_month),
      fim: comp(r.dt_end_month),
      cobranca: /^pix$/i.test(txt(r.nm_billing)) ? "pix" : "picpay"
    })),
    entradas: (d.entradas||[]).map(r => ({
      mes: "*",
      competencia: comp(r.dt_competence),
      parte1: num(r.vl_part1), parte2: num(r.vl_part2), caju: num(r.vl_caju),
      acrescimos: num(r.vl_additions),
      descontos: -Math.abs(num(r.vl_deductions))
    })),
    // o Caju já vem pela vw_ritmo; aqui ficam só as compras lançadas
    // nesta sessão, até o próximo carregamento
    caju: []
  };
}

/**
 * A CONSOLIDADO empilha Compras Caju por fórmula, então a compra chega
 * lá sozinha. O que não chega é aqui: salvar grava na aba e atualiza o
 * S.reg, mas não relê a CONSOLIDADO — o card do Caju só mudaria no
 * próximo carregamento. Estas linhas cobrem essa janela, e somem no
 * recarregamento porque a chave passa a existir dos dois lados.
 */
function recompor(){
  S.linhas = S.consolidado.concat(cajuPendentes());
  S.faturas = [...new Set(S.linhas.map(l=>l.competencia).filter(Boolean))].sort();
  if(!S.faturas.includes(S.mesSel)) S.mesSel = escolherMesInicial();
}

/**
 * Compras do Caju que ainda não apareceram na CONSOLIDADO.
 *
 * O pareamento é exato porque o transaction_id do Caju é o md5 de
 * nome|valor|data — a mesma chave que o chaveDe() monta aqui.
 * Reconstruindo essa chave a partir de description, amount_brl e
 * billing_date, dá para saber linha a linha o que já entrou na
 * CONSOLIDADO, sem risco de contar duas vezes quando ela alcançar.
 *
 * Lançamento que chegou na CONSOLIDADO sem valor casa só por nome e
 * data: o valor foi perdido no caminho e não serve para comparar.
 */
function cajuPendentes(){
  // sem a CONSOLIDADO carregada não há com o que comparar: tudo
  // pareceria pendente e o total piscaria errado
  if(!S.consolidado.length) return [];
  const lista = S.reg[chavePlanilha("caju2")] || [];
  if(!lista.length) return [];

  const contaCaju = CONTAS.find(c=>c.id==="caju") || null;
  const iso = d => d ? `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}` : "";

  const jaSubiu = new Set(), semValor = new Set();
  for(const l of S.consolidado){
    if(!l.conta || l.conta.id!=="caju") continue;
    const d = iso(l.dataFatura || l.data);
    jaSubiu.add(`${l.desc}|${(l.valor||0).toFixed(2)}|${d}`);
    if(!l.valor) semValor.add(`${l.desc}|${d}`);
  }

  const saida = [];
  const vistos = new Set();
  for(const i of lista){
    const nome = String(i.nome||"").trim();
    if(!nome) continue;
    const valor = Number(i.valor)||0;
    const dia = String(i.data||"").slice(0,10);
    const chave = `${nome}|${valor.toFixed(2)}|${dia}`;
    if(jaSubiu.has(chave)) continue;
    if(semValor.has(`${nome}|${dia}`)) continue;
    // a mesma compra pode estar duas vezes na aba (id cru antigo e id
    // com hash); a chave é a mesma, então conta uma vez só
    if(vistos.has(chave)) continue;
    vistos.add(chave);

    const data = parseData(dia) || TODAY;
    const comp = i.mes || `${data.getFullYear()}-${p2(data.getMonth()+1)}`;
    saida.push({
      id: "caju-pendente:"+chaveDe(i),
      competencia: comp,
      billId: "",
      desc: nome,
      valor,
      data,
      hora: "",
      dataFatura: data,
      metodo: "caju",
      cartao: "caju",
      conta: contaCaju,
      contaCorrente: false,
      operacao: "",
      pix: false,
      categoria: "",
      status: "PENDENTE",
      role: false,
      fixa: false,
      semana: "",
      parcela: null,
      pendente: true          // gravado agora, ainda não relido
    });
  }
  return saida;
}

/**
 * Qual competência é a fatura corrente.
 *
 * Pode haver mais de uma fatura em aberto ao mesmo tempo: na virada,
 * a do mês passado ainda não fechou e a do mês novo já começou. A
 * corrente é a mais recente das duas — é ela que ganha o selo
 * "aberta" e a contagem de dias. Sem nenhuma linha em aberto, cai no
 * mês do calendário.
 */
/* Parcela futura (2/10, 3/10…) também chega com o mês no bill_id, mas é
   só a projeção de uma fatura que ainda nem abriu. Quem diz qual fatura
   está aberta de verdade são as compras à vista e as primeiras parcelas. */
/* O Caju não tem fatura: o pipeline repete o mês no bill_id dele, mas
   isso não quer dizer fatura aberta. Se contasse, todo mês com compra
   no Caju viraria "aberto" e as faturas fechadas (uuid) do Itaú e do
   PicPay daquele mês sumiriam da conta. */
const marcaFaturaAberta = l => ehBillAberta(l.billId)
  && !(l.parcela && l.parcela.i > 1)
  && !(l.conta && l.conta.id === "caju")
  && !l.contaCorrente;

function descobrirMesAberto(linhas){
  const meses = new Set();
  for(const l of linhas){
    if(!marcaFaturaAberta(l)) continue;
    const m = mesDoBill(l.billId) || l.competencia;
    if(m) meses.add(m);
  }
  if(!meses.size) return TODAY.getFullYear()+"-"+p2(TODAY.getMonth()+1);
  return [...meses].sort().pop();
}

/** Abre na fatura aberta se ela existir; senão na mais recente. */
function escolherMesInicial(){
  const atual = S.mesAberto || (TODAY.getFullYear()+"-"+p2(TODAY.getMonth()+1));
  if(S.faturas.includes(atual)) return atual;
  const passadas = S.faturas.filter(f=>f<=atual);
  return passadas.length ? passadas[passadas.length-1] : (S.faturas[0]||atual);
}

