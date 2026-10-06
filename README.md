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
npm run deploy       # build + publica página e Worker
```

Para mexer na página com recarga automática, use dois terminais:

```bash
npm run api          # Worker na sua máquina (porta 8787)
npm run dev          # página em localhost, chamando esse Worker
```

O `npm run api` precisa de um arquivo `.dev.vars` na raiz (ele não vai para o Git) com os mesmos segredos do painel:

```
DBX_HOST=https://...
DBX_TOKEN=...
WAREHOUSE_ID=...
```

## Acesso

O Cloudflare Access fica na frente do Worker inteiro: sem login, nem a página nem a API respondem. Ele é ligado no painel, na aba **Access** do Worker. Toda rota da API confere o login de novo (`ctx.access`), então, se o Access for desligado, a API para de responder.

Para conferir quem está logado: `/api/eu`.

## Imagens

Imagens fixas ficam em `public/img/` e são servidas em `/img/nome.png`. Quando o banco crescer, ou para subir imagens sem fazer deploy, o caminho é um bucket R2.

## Segredos

`DBX_HOST`, `DBX_TOKEN` e `WAREHOUSE_ID` vivem no painel da Cloudflare (Worker → Settings → Variables and Secrets). Nunca entram no repositório. O deploy não mexe neles.
