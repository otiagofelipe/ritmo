/* ─────────── estado ─────────── */
const S = {
  consolidado: [],     // o que veio da CONSOLIDADO, cru
  linhas: [],          // consolidado + Caju ainda não sincronizado
  faturas: [],         // competências distintas, ordenadas
  mesAberto: null,     // competência da fatura com bill_id = "Atual"
  mesSel: null,
  incluirPix: false,
  soRole: false,       // marcado = mostra só os rolês
  // marcados por padrão; desmarcar tira aquele tipo de gasto de tudo
  inc: { fixos:true, parcelas:true, itau:true, picpay:true, caju:true, devo:true, devem:true },
  rolesFora: new Set(), // is_entertainment=true que eu desmarquei à mão (chaves)
  rolesMudados: new Map(), // chave → estado anterior, só o que mexi nesta sessão
  fCartao: "",         // filtro de conta na lista de gastos
  fSemana: "",         // índice da semana na lista de gastos
  faixa: null,         // [min,max] do slider de valor; null = tudo
  evParcelas: true,    // "gasto por fatura": inclui parcelas
  evFixos: true,       // "gasto por fatura": inclui contas fixas
  evCaju: true,        // "gasto por fatura": inclui o Caju
  evDe: "", evAte: "", // recorte de competências do Mês a mês
  editando: null,      // quadro em modo de edição ("devem" | "devo")
  tema: "retrowave",   // paleta escolhida no seletor do topo
  vis: { semanas:"barras", dia:"linha" },  // linha | barras | tabela, por gráfico
  busca: "",
  fonte: "",
  reg: {},          // anotações vindas das abas do app
  roles: new Set(), // chaves (descrição|valor|data) marcadas como rolê pelo app
  rolesSujo: false,
  salvando: false
};
let grupoAberto = null;

const BRL  = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const BRL0 = new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0});
const MES_L = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];
const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DIA_SEM = ["dom","seg","ter","qua","qui","sex","sáb"];
const $ = id => document.getElementById(id);
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const p2 = n => String(n).padStart(2,"0");
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm = s => String(s==null?"":s).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

/**
 * Data em horário local. Nunca usa new Date(texto) direto: em
 * "2026-08-02" o JavaScript assumiria UTC e no Brasil isso vira
 * o dia 1º.
 */
function parseData(bruto){
  if(bruto==null) return null;
  const s=String(bruto).trim();
  if(!s) return null;

  // Serial do Sheets: dia 1 = 30/12/1899. Algumas colunas chegam
  // assim quando a célula está formatada como data em vez de texto.
  if(/^\d{5}(\.\d+)?$/.test(s)){
    const dias=Math.floor(parseFloat(s));
    const base=new Date(1899,11,30);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate()+dias);
  }

  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return mk(+m[1],+m[2],+m[3]);
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(m){ let a=+m[3]; if(a<100) a+= a<70?2000:1900; return mk(a,+m[2],+m[1]); }
  m=s.match(/^(\d{4})-(\d{1,2})$/);
  if(m) return mk(+m[1],+m[2],1);
  return null;
}
function mk(a,m,d){
  if(m<1||m>12||d<1||d>31) return null;
  const x=new Date(a,m-1,d);
  return isNaN(x)?null:x;
}
// a CONSOLIDADO manda a hora sem zero à esquerda ("2026-09-20 2:13:53",
// "20:8:46"): aceita 1 ou 2 dígitos e devolve sempre hh:mm
const horaDe = s => {
  const m=String(s||"").match(/[ T](\d{1,2}):(\d{1,2})/);
  if(!m) return "";
  const hm = m[1].padStart(2,"0")+":"+m[2].padStart(2,"0");
  return hm!=="00:00" ? hm : "";
};

