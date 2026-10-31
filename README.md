# Reelio

Cole o link de um post, carrossel ou reel **público** do Instagram e baixe a foto/vídeo em alta qualidade, com a legenda pronta para copiar.

- Sem dependências: usa só o Node (18 ou mais novo). Não precisa de `node_modules`, Puppeteer nem Chrome.
- `server.js` — servidor (extração + proxy de download) · `index.html` — o site
- `test.js` + `mock-instagram.js` — testes automáticos (`npm test`), rodam sem internet
- `diagnostico.js` — testa links reais no seu PC (`node diagnostico.js`)

## Como funciona a extração
Para cada link o servidor tenta, em ordem, e para assim que obtém o resultado completo:
1. **Embed público** do post (dados estruturados + HTML);
2. **Consulta GraphQL pública** (traz carrossel completo e legenda exata);
3. **Metadados OpenGraph**.

Regras que evitam os bugs antigos:
- O tipo (vídeo/foto) vem dos **dados**, nunca da extensão do link. Um `/p/` pode ser vídeo.
- Se é vídeo/reel e o arquivo de vídeo não foi achado, devolve **erro claro** — nunca a capa como se fosse o vídeo.
- Escolhe a maior imagem **sem corte quadrado** (`stp=c...`), e o site exibe com `object-fit: contain` (sem esticar).
- O download passa pelo servidor, com `Content-Type` e extensão reais (.jpg/.png/.webp/.mp4) e suporte a `Range`.
- O proxy só baixa da CDN do Instagram (não é proxy aberto).

## Rodar no seu PC
```
node server.js        # abre em http://localhost:3000
node diagnostico.js   # testa os 4 links reais e salva diagnostico-resultado.json
npm test              # testes automáticos
```

## Variáveis de ambiente (opcionais, no Render em Environment)
| Nome | Para quê |
|---|---|
| `IG_DOC_ID` | Se o método GraphQL parar de funcionar, o Instagram pode ter trocado esse número. |
| `IG_COOKIE` | Cookie de sessão de uma conta do Instagram, caso o Instagram bloqueie o IP do Render. **Use uma conta secundária**: o cookie dá acesso à conta. |

## Se der erro no site
Em qualquer erro aparece **"Detalhes técnicos"** abaixo da mensagem: mostra qual método falhou e por quê. Copie e envie para quem for ajudar a depurar.
O Instagram costuma bloquear IPs de servidores (como os do Render); isso aparece lá como `HTTP 429/403` ou "exige login".
