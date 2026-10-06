# Ritmo

Dashboard de finanças pessoais. Um Worker da Cloudflare serve a página e a API; a API fala com o Databricks.

```
navegador ──► Worker ritmo-caju ──┬─► dist/ (página: HTML, CSS, JS)
                                  └─► /api/* ──► Databricks SQL Statement API
```

## Estrutura

```
index.html            só a marcação (o HTML do corpo da página)
src/
  main.js             ponto de entrada: importa estilos e código
  styles/             CSS, na ordem em que era dentro do <style>
  js/                 o código da página, dividido por assunto
  lista-suspensa.js   a lista suspensa própria (independente do resto)
public/               vai para dist/ como está (imagens, _headers)
worker/index.js       a API (/api/dados, /api/salvar…)
wrangler.jsonc        configuração do Worker
vite.config.js        build
```

Os arquivos de `src/js/` ainda dividem o mesmo escopo, como quando eram um `<script>` só: o build os junta em ordem de nome (`01-config.js`, `02-estado.js`…). Arquivo novo entra na ordem pelo número.

## Comandos

```bash
npm install          # uma vez
npm run dev          # página em localhost, usando o Worker publicado
npm run deploy       # build + publica página e Worker
```

`npm run dev` recarrega sozinho a cada arquivo salvo.

## Imagens

Imagens fixas ficam em `public/img/` e são servidas em `/img/nome.png`. Quando o banco crescer, ou para subir imagens sem fazer deploy, o caminho é um bucket R2.

## Segredos

`DBX_HOST`, `DBX_TOKEN` e `WAREHOUSE_ID` vivem no painel da Cloudflare (Worker → Settings → Variables and Secrets). Nunca entram no repositório. O deploy não mexe neles.
