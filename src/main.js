/* ══════════════════════════════════════════════════════════════
   RITMO · ponto de entrada

   O Vite junta tudo isto num CSS e num JS só, minificados e com hash
   no nome (main-a8f3c1.js). O hash muda quando o conteúdo muda, então
   o navegador pode guardar os arquivos para sempre sem nunca ficar
   preso numa versão velha.

   Estilos: na ordem em que aparecem aqui, como era dentro do <style>.

   Código: os arquivos de src/js/ ainda dividem o mesmo escopo (um usa
   funções do outro sem import), como era quando tudo vivia num
   <script> só. O módulo "virtual:ritmo" os junta, em ordem de nome,
   num bloco único (ver vite.config.js). Dá para ir trocando por
   import/export de verdade aos poucos, um arquivo por vez.
   ══════════════════════════════════════════════════════════════ */

import "./styles/01-tokens.css";
import "./styles/02-base.css";
import "./styles/03-casca.css";
import "./styles/04-dashboard.css";
import "./styles/05-componentes.css";
import "./styles/06-editores.css";
import "./styles/07-celular.css";
import "./styles/08-responsivo.css";
import "./styles/09-claro.css";

import "virtual:ritmo";
import "./lista-suspensa.js";
