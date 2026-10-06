/* ─────────── quadros anotados ─────────── */

const CENT = new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const hojeISO = () => `${TODAY.getFullYear()}-${p2(TODAY.getMonth()+1)}-${p2(TODAY.getDate())}`;

function somaDias(iso, n){
  const [a,m,d]=String(iso||hojeISO()).split("-").map(Number);
  const x=new Date(a,(m||1)-1,d||1);
  x.setDate(x.getDate()+n);
  return `${x.getFullYear()}-${p2(x.getMonth()+1)}-${p2(x.getDate())}`;
}

/**
 * Campo de dinheiro estilo caixa eletrônico: só dígitos entram e cada
 * um empurra o número para a esquerda. Guarda centavos como inteiro e
 * reformata a cada tecla, devolvendo o cursor ao fim — senão ele fica
 * preso no meio da máscara.
 */
function campoMoeda(inicial, aoMudar){
  const el=document.createElement("input");
  el.className="num"; el.inputMode="numeric"; el.placeholder="0,00";
  let cent=Math.round((Number(inicial)||0)*100);
  const pinta=()=>{ el.value = cent ? CENT.format(cent/100) : ""; };
  pinta();
  el.addEventListener("input",()=>{
    const d=el.value.replace(/\D/g,"").slice(0,11);
    cent = d ? parseInt(d,10) : 0;
    pinta();
    const fim=el.value.length;
    try{ el.setSelectionRange(fim,fim); }catch(e){}
    aoMudar(cent/100);
  });
  el.addEventListener("focus",()=>{ const f=el.value.length; try{ el.setSelectionRange(f,f); }catch(e){} });
  return el;
}

const grupoDe = id => GRUPOS.find(g=>g.id===id) || {};
const chavePlanilha = id => grupoDe(id).grupoPlanilha || id;
const mesDoGrupo = id => grupoDe(id).todosOsMeses ? "*" : S.mesSel;

/**
 * Itens crus de um grupo na competência aberta. É o que o editor
 * mostra e o que volta para a planilha — sem parcela expandida, sem
 * filtro de rolê, senão salvar apagaria o que está fora da vista.
 */
function itensGrupo(id){
  const g=grupoDe(id);
  const lista=S.reg[chavePlanilha(id)]||[];
  return lista.filter(i => g.todosOsMeses || i.mes===S.mesSel);
}

/** Distância em meses entre duas competências aaaa-mm. */
function distMeses(de, ate){
  const [a1,m1]=String(de||"").split("-").map(Number);
  const [a2,m2]=String(ate||"").split("-").map(Number);
  if(!a1||!m1||!a2||!m2) return null;
  return (a2-a1)*12 + (m2-m1);
}

/**
 * Itens como aparecem no mês: é isto que soma nos cards e no total.
 *
 * Diferente do cru em duas coisas. Um item parcelado é lançado uma vez
 * só, na competência em que foi criado, mas pesa valor/n em cada uma
 * das n competências seguintes — aqui ele vira a fatia daquele mês.
 */
function itensDoMes(id, comp){
  const mes = comp || S.mesSel;
  const g=grupoDe(id);
  if(S.soRole) return [];   // rolê é gasto de cartão, não dívida anotada
  const lista=S.reg[chavePlanilha(id)]||[];
  const parcelavel = (g.campos||[]).includes("parcelas");
  let saida=[];

  if(g.todosOsMeses){
    saida = fixasVigentes(mes);
  }else{
    lista.forEach((i, refIdx)=>{
      const ini = inicioDe(i);
      const { n, indet } = parcelavel ? parcelasDe(i) : { n:1, indet:false };

      // indeterminado: vale todo mês a partir do início, sem fim
      if(indet){
        const k = distMeses(ini, mes);
        if(k===null || k<0) return;
        saida.push({...i, indeterminado:true, pago:estaPago(i, mes), mesRef:mes, refIdx});
        return;
      }
      if(n<=1){
        if(ini===mes) saida.push({...i, pago:estaPago(i, mes), mesRef:mes, refIdx});
        return;
      }
      const k = distMeses(ini, mes);
      if(k===null || k<0 || k>=n) return;
      saida.push({...i, valor:fatiaParcela(i.valor, n, k),
                  parcela:{i:k+1, n}, valorTotal:Number(i.valor)||0,
                  pago:estaPago(i, mes), mesRef:mes, refIdx});
    });
    if(id==="devo") saida = saida.concat(fixasPixComoDevo(mes));
  }

  return saida;
}

/**
 * Competência da primeira parcela. `mesInicio` é escolhido no
 * formulário; registro antigo não tem, e aí vale o mês em que ele foi
 * lançado — o comportamento que já existia.
 */
const inicioDe = i => compDe(i.mesInicio) || i.mes;

/**
 * Pagamento é por competência, não por registro.
 *
 * Um parcelamento de 10x tem dez cobranças; marcar "pago" no registro
 * inteiro diria que as dez foram quitadas de uma vez. O campo `pagos`
 * guarda a lista de competências já pagas ("2026-08;2026-09").
 *
 * Registro antigo não tem `pagos` e só tem o booleano `pago` — como
 * ele nasceu de um lançamento de mês único, o booleano vale para a
 * competência dele e para mais nenhuma.
 */
const pagosDe = i => new Set(
  String(i.pagos||"").split(/[;,]/).map(t=>t.trim()).filter(Boolean));

function estaPago(i, mes){
  const alvo = mes || S.mesSel;
  const set = pagosDe(i);
  if(set.size) return set.has(alvo);
  /* Sem a lista, o booleano antigo vale só para a competência em que
     o registro começa. Valer para todas faria um parcelamento inteiro
     parecer quitado por causa de uma marcação de um mês só. */
  return !!i.pago && alvo === inicioDe(i);
}

/** Devolve o texto do campo `pagos` com a competência ligada ou desligada. */
function alternarPago(i, mes, ligado){
  const set = pagosDe(i);
  // primeira marcação num registro que só tinha o booleano antigo
  if(!set.size && i.pago) set.add(inicioDe(i));
  ligado ? set.add(mes) : set.delete(mes);
  return [...set].sort().join(";");
}

/**
 * Como um registro anotado viaja para a planilha. Uma definição só,
 * usada pelo editor e pela marcação de pago feita direto na lista.
 */
function linhaPayload(id, it){
  const linha = {
    nome:it.nome, pessoa:it.pessoa||"", valor:it.valor, data:it.data||"",
    pago:!!it.pago, pagos:String(it.pagos||""), terceiro:!!it.terceiro,
    parcelas: parcelasDe(it).indet ? INDETERMINADO : parcelasDe(it).n,
    mesInicio:it.mesInicio||"", inicio:it.inicio||"", fim:it.fim||""
  };
  if((grupoDe(id).campos||[]).includes("apelido")) linha.apelido = it.apelido||"";
  if((grupoDe(id).campos||[]).includes("cobranca")) linha.cobranca = cobrancaFixa(it);
  // id só viaja quando existe; vazio só sujava a coluna
  const idp = idPlanilha(id, it) || it.id || "";
  if(idp) linha.id = idp;
  return linha;
}

/** Todos os registros de um grupo numa competência, prontos para salvar. */
function payloadGrupo(id, mes){
  const g = grupoDe(id);
  return (S.reg[chavePlanilha(id)]||[])
    .filter(i => g.todosOsMeses || i.mes===mes)
    .map(i => linhaPayload(id, i));
}

/** Quantas parcelas um registro tem. 0 = indeterminado, sem fim. */
const INDETERMINADO = 0;
const MAX_PARCELAS  = 36;
function parcelasDe(i){
  const bruto = i.parcelas;
  if(bruto === INDETERMINADO || String(bruto) === "0") return { n:0, indet:true };
  return { n: Math.min(MAX_PARCELAS, Math.max(1, Math.round(Number(bruto)||1))), indet:false };
}

/**
 * Fatia de uma parcela em centavos inteiros. As n-1 primeiras levam o
 * piso e a última absorve a sobra, então a soma bate exatamente com o
 * valor cheio: 100 em 3x vira 33,33 + 33,33 + 33,34.
 */
function fatiaParcela(total, n, k){
  const cent = Math.round((Number(total)||0)*100);
  const base = Math.floor(cent/n);
  return (k===n-1 ? cent-base*(n-1) : base)/100;
}

/** Todas as parcelas futuras de um grupo, agrupadas por competência. */
function parcelasFuturas(id, depoisDe){
  const corte = depoisDe || S.mesAberto || S.mesSel;
  const mapa = new Map();
  for(const i of (S.reg[chavePlanilha(id)]||[])){
    const n = Math.max(1, Math.round(Number(i.parcelas)||1));
    if(n<=1) continue;
    const ini = inicioDe(i);
    for(let k=0;k<n;k++){
      const comp = somaMeses(ini, k);
      if(!comp || comp<=corte) continue;
      mapa.set(comp, (mapa.get(comp)||0) + fatiaParcela(i.valor, n, k));
    }
  }
  return [...mapa.entries()].sort();
}

/** Competência deslocada em n meses. */
function somaMeses(comp, n){
  const [a,m]=String(comp||"").split("-").map(Number);
  if(!a||!m) return null;
  const t=(a*12+(m-1))+n;
  return `${Math.floor(t/12)}-${p2(t%12+1)}`;
}

/**
 * O que entra nas contas do Dashboard. Com o botão Fixos desmarcado, a
 * Enel (conta fixa anotada em "Eu devo") sai junto com os outros fixos.
 * Os chips Eu devo e Me devem, desmarcados, tiram o grupo inteiro.
 * Só as somas mudam: a lista e o editor de "Eu devo" seguem mostrando
 * tudo, para nada sumir de um registro por causa de um filtro.
 */
/** Item de "Eu devo" que é conta fixa: a Enel anotada à mão e os fixos pagos por Pix. */
const ehDevoFixo = i => !!i.fixaPix || DEVO_RECORRENTE.test(`${i.nome||""} ${i.pessoa||""}`);
const itensContados = (id, comp) => {
  if((id==="devo" || id==="devem") && !S.inc[id]) return [];   // chip desmarcado: fora das contas
  const itens = itensDoMes(id, comp);
  return (id==="devo" && !S.inc.fixos) ? itens.filter(i=>!ehDevoFixo(i)) : itens;
};
const somaGrupo = (id, comp) => itensContados(id, comp).reduce((a,i)=>a+(Number(i.valor)||0),0);

