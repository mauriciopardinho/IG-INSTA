'use strict';
/**
 * Testes automáticos (npm test). Rodam contra um Instagram SIMULADO (mock-instagram.js),
 * então não dependem de internet nem do estado real do Instagram.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startMock } = require('./mock-instagram.js');

let mock, app, base;

test.before(async () => {
  mock = await startMock();
  process.env.IG_BASE = mock.base;
  process.env.ALLOW_MEDIA_HOSTS = '127.0.0.1';
  app = require('./server.js');
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
test.after(async () => { app.server.close(); await mock.close(); });

const extract = async (url, qs = '') => {
  const res = await fetch(`${base}/extract${qs}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  return { status: res.status, body: await res.json() };
};
const post = (code, kind = 'p') => `https://www.instagram.com/${kind}/${code}/?utm_source=ig_web_copy_link&xtok=ABC`;

// ---------------------------------------------------------------------------
test('links: aceita os 4 links reais com parâmetros extras e variações', () => {
  const p = app.parseInstagramUrl;
  assert.deepEqual(p('https://www.instagram.com/p/De-Tehfx2tr/?utm_source=ig_web_copy_link&xtok=NTc4MTIwNjQ2YQ=='), { shortcode: 'De-Tehfx2tr', kind: 'p', videoHint: false });
  assert.equal(p('https://www.instagram.com/p/De-C6pts5VH/?utm_source=ig_web_copy_link&exln=NTc4MTIwNjQ2YQ==').shortcode, 'De-C6pts5VH');
  assert.equal(p('https://www.instagram.com/p/De9zPROh9ZS/?utm_source=ig_web_copy_link&vrfl=NTc4MTIwNjQ2YQ==').shortcode, 'De9zPROh9ZS');
  assert.deepEqual(p('https://www.instagram.com/reel/De-ZySjtIx2/?utm_source=ig_web_copy_link&psln=NTc4MTIwNjQ2YQ'), { shortcode: 'De-ZySjtIx2', kind: 'reel', videoHint: true });
  assert.equal(p('https://www.instagram.com/instagram/reel/DecLR_vvrW6/').shortcode, 'DecLR_vvrW6');
  assert.equal(p('instagram.com/reels/ABCDE12345').shortcode, 'ABCDE12345'); // colado sem https://
  assert.equal(p('https://instagram.com/reels/ABCDE12345/').kind, 'reel');
  assert.equal(p('https://www.instagram.com/tv/ABCDE12345/').videoHint, true);
  assert.deepEqual(p('https://www.instagram.com/share/reel/BAhx12345/'), { share: true, pathname: '/share/reel/BAhx12345/' });
  assert.equal(p('https://not-instagram.com/p/ABCDE12345/'), null);
  assert.equal(p('https://evil.com/?u=instagram.com/p/ABCDE12345/'), null);
  assert.equal(p('https://www.instagram.com/stories/'), null);
});

test('legenda: og:description em inglês e português, emojis e entidades', () => {
  const c = app.captionFromOgDescription;
  assert.equal(c('1,234 likes, 56 comments - user on October 14, 2026: "Olá mundo".'), 'Olá mundo');
  assert.equal(c('1.234 curtidas, 56 comentários - user em 14 de outubro de 2026: "Legenda: com dois pontos".'), 'Legenda: com dois pontos');
  assert.equal(c('10 likes, 2 comments - user on May 1, 2026'), '');
  assert.equal(app.decodeEntities('&#x1f4cc; &#128640; &quot;x&quot; &amp;amp; &#039;'), '📌 🚀 "x" &amp; \'');
});

test('legenda do embed: respeita divs aninhadas, <br>, emojis e ignora comentários', () => {
  const html = '<div class="Caption"><a class="CaptionUsername" href="/u/">u</a><br/>Linha 1 &#x1f525;<br/><br/>Linha 3 &amp; fim<div class="CaptionComments"><a>Ver todos os 3 comentários</a></div></div><div>fora</div>';
  assert.equal(app.parseEmbedCaption(html), 'Linha 1 🔥\n\nLinha 3 & fim');
});

test('imagem: escolhe a maior versão SEM corte quadrado (evita foto cortada/esticada)', () => {
  const best = app.bestImageUrl({
    display_resources: [
      { src: 'https://x.cdninstagram.com/a.jpg?stp=c0.135.1080.1080a_dst-jpg&oh=1', config_width: 1080 },
      { src: 'https://x.cdninstagram.com/b.jpg?stp=dst-jpg_e35_s750x750&oh=2', config_width: 750 },
      { src: 'https://x.cdninstagram.com/c.jpg?stp=dst-jpg_e35_s150x150&oh=3', config_width: 150 },
    ],
  });
  assert.match(best, /b\.jpg/);
});

// ---------------------------------------------------------------------------
test('/p/ que é VÍDEO vira vídeo (não imagem), com legenda exata (emoji, parágrafos, aspas)', async () => {
  const { status, body } = await extract(post('VIDEOPOST1'));
  assert.equal(status, 200);
  assert.equal(body.type, 'video');
  assert.equal(body.items[0].type, 'video');
  assert.match(body.items[0].url, /\/cdn\/vid\.mp4\?efg=1&oh=2$/);       // & e \/ desfeitos
  assert.equal(body.caption, '📸 Primeiro parágrafo\n\nSegundo com "aspas" e emoji 🔥');
  assert.equal(body.username, 'fulano');
});

test('foto só com HTML do embed: tipo imagem, legenda limpa e confirmada pelos outros métodos', async () => {
  const { status, body } = await extract(post('IMGHTML01'));
  assert.equal(status, 200);
  assert.equal(body.type, 'image');
  assert.match(body.items[0].url, /img\.jpg\?stp=dst-jpg_e35_s640x640&oh=1$/);
  assert.equal(body.caption, 'Linha 1 📌 com "aspas"\n\nLinha 3 & fim');
});

test('foto com dado estruturado explícito: aceita direto e usa a versão sem corte', async () => {
  const { body } = await extract(post('IMGAUTH01'), '?debug=1');
  assert.equal(body.type, 'image');
  assert.doesNotMatch(body.items[0].url, /stp=c0\./);
  assert.deepEqual(body.trace.map((t) => t.method), ['embed']);          // não gastou outras requisições
  assert.equal(body.caption, 'Só foto');
});

test('vídeo que o embed mostra como capa: o OpenGraph revela e o resultado vira VÍDEO', async () => {
  const { status, body } = await extract(post('HIDDENVID1'));
  assert.equal(status, 200);
  assert.equal(body.type, 'video');
  assert.match(body.items[0].url, /vid\.mp4/);
  assert.equal(body.caption, 'Vídeo escondido');
});

test('carrossel: devolve todos os itens (2 fotos + 1 vídeo), na ordem, sem versões cortadas', async () => {
  const { status, body } = await extract(post('CAROUSEL01'));
  assert.equal(status, 200);
  assert.equal(body.type, 'carousel');
  assert.deepEqual(body.items.map((i) => i.type), ['image', 'image', 'video']);
  assert.doesNotMatch(body.items[0].url, /stp=c0\./);
  assert.equal(body.caption, 'Legenda do carrossel 🎠');
});

test('reel sem arquivo de vídeo: NUNCA devolve a capa como se fosse o vídeo', async () => {
  const { status, body } = await extract(post('REELNOVID1', 'reel'));
  assert.equal(status, 422);
  assert.equal(body.items, undefined);
  assert.match(body.error, /vídeo/i);
  assert.ok(Array.isArray(body.trace) && body.trace.length === 3);
});

test('embed sabe que é vídeo mas sem arquivo: pega o arquivo no GraphQL e mantém a legenda do embed', async () => {
  const { status, body } = await extract(post('GQLVIDEO01', 'reel'));
  assert.equal(status, 200);
  assert.equal(body.type, 'video');
  assert.match(body.items[0].url, /vid\.mp4\?oh=g/);
  assert.equal(body.caption, 'Legenda vinda do embed');
});

test('post removido/privado: 404 com mensagem clara', async () => {
  const { status, body } = await extract(post('GONE000001'));
  assert.equal(status, 404);
  assert.match(body.error, /não está disponível/);
});

test('entradas inválidas: 400', async () => {
  assert.equal((await extract('https://google.com')).status, 400);
  assert.equal((await extract('')).status, 400);
});

test('cache: segunda busca do mesmo post não consulta o Instagram de novo', async () => {
  await extract(post('VIDEOPOST1'));
  const before = mock.stats.hits.length;
  const { body } = await extract(post('VIDEOPOST1'), '?debug=1');
  assert.equal(mock.stats.hits.length, before);
  assert.equal(body.trace[0].method, 'cache');
});

// ---------------------------------------------------------------------------
test('download: imagem sai como .jpg com content-type de imagem, como anexo', async () => {
  const u = encodeURIComponent(mock.cdn('img.jpg'));
  const res = await fetch(`${base}/download?url=${u}&type=image&dl=1&name=reelio-abc-1`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="reelio-abc-1\.jpg"$/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 3).toString('hex'), 'ffd8ff');
});

test('download: vídeo sai como .mp4 / video/mp4, mesmo se a CDN disser octet-stream', async () => {
  const u = encodeURIComponent(mock.cdn('vid.mp4', 'octet=1'));
  const res = await fetch(`${base}/download?url=${u}&type=video&dl=1`);
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.match(res.headers.get('content-disposition'), /filename="reelio\.mp4"/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(4, 8).toString(), 'ftyp');
});

test('download: se pedir "vídeo" mas a CDN entrega imagem, o arquivo NÃO é corrompido (.jpg)', async () => {
  const u = encodeURIComponent(mock.cdn('img.jpg'));
  const res = await fetch(`${base}/download?url=${u}&type=video&dl=1`);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.match(res.headers.get('content-disposition'), /\.jpg"/);
});

test('download: Range (necessário para tocar/pular vídeo) responde 206 com o trecho certo', async () => {
  const u = encodeURIComponent(mock.cdn('vid.mp4'));
  const res = await fetch(`${base}/download?url=${u}&type=video`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(res.status, 206);
  assert.match(res.headers.get('content-range'), /^bytes 0-99\//);
  assert.equal((await res.arrayBuffer()).byteLength, 100);
  assert.match(res.headers.get('content-disposition'), /^inline/);
});

test('download: link expirado vira erro claro (502), não redireciona', async () => {
  const u = encodeURIComponent(mock.cdn('expired.jpg'));
  const res = await fetch(`${base}/download?url=${u}&type=image`, { redirect: 'manual' });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /expirar|expirado/);
});

test('segurança: o proxy só baixa da CDN do Instagram (não é proxy aberto)', async () => {
  for (const bad of ['https://example.com/a.jpg', 'http://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'http://localhost:1/x', 'https://evilcdninstagram.com/a.jpg']) {
    const res = await fetch(`${base}/download?url=${encodeURIComponent(bad)}`);
    assert.equal(res.status, 400, bad);
  }
  assert.equal(app.isAllowedMediaUrl('https://scontent-gru1-1.cdninstagram.com/v/t51/a.jpg?x=1'), true);
  assert.equal(app.isAllowedMediaUrl('https://instagram.fgru1-1.fna.fbcdn.net/v/t51/a.mp4'), true);
});

test('o servidor não expõe o código-fonte (nada de servir a pasta inteira)', async () => {
  for (const p of ['/server.js', '/package.json', '/../server.js', '/.env']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 404, p);
  }
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/health')).status, 200);
});
