import { defineConfig } from "vite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/* Junta src/js/*.js, em ordem de nome, num módulo só.
   Os arquivos ainda compartilham variáveis e funções entre si, como
   quando eram um <script> único; separados em módulos, cada um teria o
   seu escopo e as referências quebrariam. */
const PASTA = resolve(import.meta.dirname, "src/js");
const ID = "virtual:ritmo";
const RESOLVIDO = "\0" + ID;

function ritmo() {
  return {
    name: "ritmo-juntar-js",
    resolveId: id => (id === ID ? RESOLVIDO : null),
    load(id) {
      if (id !== RESOLVIDO) return null;
      const arquivos = readdirSync(PASTA).filter(f => f.endsWith(".js")).sort();
      // no `vite dev`, editar qualquer um deles recarrega a página
      arquivos.forEach(f => this.addWatchFile(resolve(PASTA, f)));
      return arquivos
        .map(f => `/* ─── src/js/${f} ─── */\n` + readFileSync(resolve(PASTA, f), "utf8"))
        .join("\n");
    },
    handleHotUpdate({ file, server }) {
      if (file.startsWith(PASTA)) {
        const mod = server.moduleGraph.getModuleById(RESOLVIDO);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [ritmo()],
  build: { outDir: "dist", assetsDir: "assets" },
  server: {
    /* no `npm run dev`, /api vai para o Worker rodando na sua máquina
       (`npm run api`, em outro terminal). O publicado não serve: ele
       pede login do Access, e o proxy não tem como fazer esse login. */
    proxy: { "/api": "http://localhost:8787" },
  },
});
