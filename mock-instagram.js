'use strict';
/**
 * Instagram SIMULADO, usado só nos testes (npm test). Não é necessário em produção.
 * Reproduz os formatos de resposta que o Reelio precisa entender: embed (com e sem JSON),
 * consulta GraphQL, página OpenGraph e a CDN de mídia (com suporte a Range).
 */
const http = require('node:http');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]), Buffer.alloc(990, 7), Buffer.from([0xff, 0xd9])]);
const MP4 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(2000, 9)]);

function startMock({ assets } = {}) {
  const files = assets || {
    'img.jpg': { type: 'image/jpeg', buf: JPEG },
    'vid.mp4': { type: 'video/mp4', buf: MP4 },
  };
  let base = '';
  const cdn = (name, qs = 'stp=dst-jpg_e35_s1080x1350&oh=abc&oe=1') => `${base}/cdn/${name}?${qs}`;

  // ---- construtores de resposta ------------------------------------------------
  const pad = '<!-- ' + 'x'.repeat(600) + ' -->';
  // Imita o que o Instagram faz: JSON dentro de JSON, com & e \/ nas URLs.
  const contextJSON = (media) => {
    const inner = JSON.stringify({ context: { shortcode: media.shortcode }, gql_data: { shortcode_media: media } });
    const esc = JSON.stringify(inner).replace(/&/g, '\\u0026').replace(/\//g, '\\/');
    return `<script>requireLazy(["x"],function(){window.__d={"contextJSON":${esc}};});</script>`;
  };
  const embedPage = (inner) => `<!DOCTYPE html><html><body>${pad}<div class="Embed">${inner}</div></body></html>`;
  const embedHtmlImage = (src, captionHtml) =>
    embedPage(`<div class="EmbeddedMedia"><img class="EmbeddedMediaImage" alt="foto" src="${src.replace(/&/g, '&amp;')}"></div>` +
      `<div class="Caption"><a class="CaptionUsername" href="/fulano/">fulano</a>${captionHtml}` +
      `<div class="CaptionComments"><a href="/p/x/">Ver todos os 12 comentários</a></div></div>`);
  const ogPage = ({ image, video, type = 'article', desc }) => `<!DOCTYPE html><html><head>${pad}` +
    (image ? `<meta property="og:image" content="${image.replace(/&/g, '&amp;')}" />` : '') +
    (video ? `<meta property="og:video" content="${video.replace(/&/g, '&amp;')}" />` : '') +
    `<meta property="og:type" content="${type}" />` +
    (desc ? `<meta property="og:description" content="${desc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />` : '') +
    `</head><body></body></html>`;
  const caption = (t) => ({ edges: [{ node: { text: t } }] });

  // ---- cenários, por shortcode -------------------------------------------------
  const scenarios = () => ({
    // /p/ que é VÍDEO, com dados estruturados no embed
    VIDEOPOST1: {
      embed: () => embedPage(contextJSON({
        __typename: 'GraphVideo', shortcode: 'VIDEOPOST1', is_video: true,
        video_url: cdn('vid.mp4', 'efg=1&oh=2'), display_url: cdn('img.jpg'),
        owner: { username: 'fulano' }, edge_media_to_caption: caption('📸 Primeiro parágrafo\n\nSegundo com "aspas" e emoji 🔥'),
      })),
    },
    // /p/ de foto só com HTML do embed (sem JSON)
    IMGHTML01: {
      embed: () => embedHtmlImage(cdn('img.jpg', 'stp=dst-jpg_e35_s640x640&oh=1'),
        '<br/>Linha 1 &#x1f4cc; com &quot;aspas&quot;<br/><br/>Linha 3 &amp; fim'),
      og: () => ogPage({ image: cdn('img.jpg'), desc: '10 likes, 2 comments - fulano on October 14, 2026: "Linha 1 (curta)".' }),
    },
    // foto com dado estruturado explícito: aceita sem consultar mais nada
    IMGAUTH01: {
      embed: () => embedPage(contextJSON({
        __typename: 'GraphImage', shortcode: 'IMGAUTH01', is_video: false, display_url: cdn('img.jpg'),
        display_resources: [{ src: cdn('img.jpg', 'stp=c0.135.1080.1080a_dst-jpg&oh=3'), config_width: 1080 }],
        edge_media_to_caption: caption('Só foto'),
      })),
    },
    // /p/ que é vídeo, mas o embed só mostra a capa SEM nenhum sinal; só o OpenGraph revela o vídeo
    HIDDENVID1: {
      embed: () => embedHtmlImage(cdn('img.jpg'), '<br/>Vídeo escondido'),
      graphql: () => ({ data: { xdt_shortcode_media: null } }),
      og: () => ogPage({ image: cdn('img.jpg'), video: cdn('vid.mp4', 'efg=1&oh=9'), type: 'video', desc: '1 likes, 0 comments - fulano on May 1, 2026: "Vídeo escondido".' }),
    },
    // carrossel: embed só traz a 1ª foto; GraphQL traz tudo
    CAROUSEL01: {
      embed: () => embedHtmlImage(cdn('img.jpg'), '<br/>Carrossel'),
      graphql: () => ({
        data: {
          xdt_shortcode_media: {
            __typename: 'XDTGraphSidecar', shortcode: 'CAROUSEL01', owner: { username: 'fulano' },
            edge_media_to_caption: caption('Legenda do carrossel 🎠'),
            edge_sidecar_to_children: {
              edges: [
                { node: { __typename: 'XDTGraphImage', is_video: false, display_url: cdn('img.jpg', 'oh=a'),
                  display_resources: [{ src: cdn('img.jpg', 'stp=c0.100.800.800a_dst-jpg&oh=b'), config_width: 800 }] } },
                { node: { __typename: 'XDTGraphImage', is_video: false, display_url: cdn('img.jpg', 'oh=c') } },
                { node: { __typename: 'XDTGraphVideo', is_video: true, video_url: cdn('vid.mp4', 'oh=d'), display_url: cdn('img.jpg', 'oh=e') } },
              ],
            },
          },
        },
      }),
    },
    // reel em que NENHUM método entrega o vídeo: nunca pode devolver a capa como se fosse o vídeo
    REELNOVID1: {
      embed: () => embedHtmlImage(cdn('img.jpg'), '<br/>Reel sem arquivo'),
      graphql: () => ({ data: { xdt_shortcode_media: null } }),
      og: () => ogPage({ image: cdn('img.jpg'), type: 'website' }),
    },
    // embed sabe que é vídeo mas não traz o arquivo; GraphQL traz
    GQLVIDEO01: {
      embed: () => embedPage(contextJSON({
        __typename: 'GraphVideo', shortcode: 'GQLVIDEO01', is_video: true, display_url: cdn('img.jpg'),
        edge_media_to_caption: caption('Legenda vinda do embed'),
      })),
      graphql: () => ({
        data: { xdt_shortcode_media: { __typename: 'XDTGraphVideo', is_video: true, video_url: cdn('vid.mp4', 'oh=g'), display_url: cdn('img.jpg'),
          edge_media_to_caption: caption('Legenda do GraphQL') } },
      }),
    },
    // post removido / privado
    GONE000001: {
      embed: () => embedPage('<div class="Err">Sorry, this post isn\'t available.</div>'),
      graphql: () => ({ data: { xdt_shortcode_media: null } }),
      og: () => '<html></html>',
    },
  });

  const sc = scenarios();
  const stats = { hits: [] };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    stats.hits.push(`${req.method} ${url.pathname}`);
    const send = (status, type, body, extra = {}) => { res.writeHead(status, { 'Content-Type': type, ...extra }); res.end(body); };

    // CDN de mídia com Range
    if (url.pathname.startsWith('/cdn/')) {
      const name = url.pathname.slice(5);
      if (name === 'expired.jpg') return send(403, 'text/plain', 'URL signature expired');
      const f = files[name];
      if (!f) return send(404, 'text/plain', 'nope');
      const range = req.headers.range && req.headers.range.match(/bytes=(\d+)-(\d*)/);
      if (range) {
        const s = Number(range[1]); const e = Math.min(range[2] ? Number(range[2]) : f.buf.length - 1, f.buf.length - 1);
        return send(206, f.type, f.buf.subarray(s, e + 1), { 'Content-Range': `bytes ${s}-${e}/${f.buf.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
      }
      // como a CDN real: às vezes serve vídeo como octet-stream
      const type = name.endsWith('.mp4') && url.searchParams.get('octet') ? 'application/octet-stream' : f.type;
      return send(200, type, f.buf, { 'Accept-Ranges': 'bytes', 'Content-Length': f.buf.length });
    }

    let m = url.pathname.match(/^\/p\/([^/]+)\/embed\/captioned\/?$/);
    if (m) { const s = sc[m[1]]; return s && s.embed ? send(200, 'text/html', s.embed()) : send(404, 'text/html', 'nf'); }

    if (req.method === 'POST' && url.pathname === '/graphql/query') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const vars = JSON.parse(new URLSearchParams(raw).get('variables') || '{}');
        const s = sc[vars.shortcode];
        send(200, 'application/json', JSON.stringify(s && s.graphql ? s.graphql() : { data: { xdt_shortcode_media: null } }));
      });
      return;
    }

    m = url.pathname.match(/^\/(?:p|reel|tv)\/([^/]+)\/?$/);
    if (m) { const s = sc[m[1]]; return s && s.og ? send(200, 'text/html', s.og()) : send(200, 'text/html', '<html><body>login</body></html>'); }

    send(404, 'text/plain', 'nf');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve({ base, cdn, stats, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { startMock };
