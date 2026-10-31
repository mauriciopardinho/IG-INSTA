'use strict';
/**
 * Diagnóstico com os links REAIS — rode no seu PC:   node diagnostico.js
 * (ou com seus próprios links:  node diagnostico.js "https://www.instagram.com/p/XXXX/")
 *
 * Para cada link: extrai a mídia, baixa o começo de cada arquivo pelo proxy do Reelio e confere se
 * é mesmo JPG/PNG/WEBP/MP4. Gera o arquivo diagnostico-resultado.json (pode me mandar o conteúdo).
 */
const fs = require('node:fs');
const path = require('node:path');
const app = require('./server.js');

const DEFAULT_LINKS = [
  'https://www.instagram.com/p/De-Tehfx2tr/?utm_source=ig_web_copy_link&xtok=NTc4MTIwNjQ2YQ==',
  'https://www.instagram.com/p/De-C6pts5VH/?utm_source=ig_web_copy_link&exln=NTc4MTIwNjQ2YQ==',
  'https://www.instagram.com/p/De9zPROh9ZS/?utm_source=ig_web_copy_link&vrfl=NTc4MTIwNjQ2YQ==',
  'https://www.instagram.com/reel/De-ZySjtIx2/?utm_source=ig_web_copy_link&psln=NTc4MTIwNjQ2YQ',
];
const links = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_LINKS;

function sniff(buf) {
  if (buf.length >= 3 && buf.subarray(0, 3).toString('hex') === 'ffd8ff') return 'JPG';
  if (buf.length >= 8 && buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'PNG';
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'WEBP';
  if (buf.length >= 8 && buf.subarray(4, 8).toString() === 'ftyp') return 'MP4';
  return 'DESCONHECIDO';
}

(async () => {
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const report = [];
  let okCount = 0;

  for (const link of links) {
    console.log('\n==================================================================');
    console.log('LINK:', link.slice(0, 90));
    const t0 = Date.now();
    const res = await fetch(`${base}/extract?debug=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link }) });
    const data = await res.json();
    const entry = { link, http: res.status, ms: Date.now() - t0, trace: data.trace, result: null, files: [] };
    report.push(entry);

    console.log(`HTTP ${res.status} em ${entry.ms}ms`);
    for (const t of data.trace || []) console.log(`  método ${t.method.padEnd(9)} itens=${t.items ?? '-'} vídeo=${t.video ?? '-'} status=${t.status ?? '-'} ${t.ms}ms  ${t.note || ''}`);
    if (res.status !== 200) { console.log('FALHOU:', data.error); continue; }

    entry.result = { type: data.type, username: data.username, caption: data.caption, items: data.items.map((i) => i.type) };
    console.log(`TIPO: ${data.type}  @${data.username || '?'}  itens: ${data.items.map((i) => i.type).join(', ')}`);
    console.log('LEGENDA:', data.caption ? JSON.stringify(data.caption.slice(0, 160)) : '(vazia)');

    let allOk = true;
    for (const [i, it] of data.items.entries()) {
      const q = `${base}/download?url=${encodeURIComponent(it.url)}&type=${it.type}&dl=1`;
      let r, buf;
      try {
        r = await fetch(q, { headers: { Range: 'bytes=0-4095' } });
        buf = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        allOk = false;
        entry.files.push({ item: i + 1, type: it.type, ok: false, erro: e.message });
        console.log(`  arquivo ${i + 1}: ${it.type} -> ERRO ao baixar: ${e.message} <<< PROBLEMA`);
        continue;
      }
      const kind = sniff(buf);
      const expected = it.type === 'video' ? 'MP4' : ['JPG', 'PNG', 'WEBP'];
      const good = r.status < 400 && (Array.isArray(expected) ? expected.includes(kind) : kind === expected);
      allOk = allOk && good;
      entry.files.push({ item: i + 1, type: it.type, http: r.status, contentType: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), magic: kind, ok: good });
      console.log(`  arquivo ${i + 1}: ${it.type} -> HTTP ${r.status} ${r.headers.get('content-type')} | conteúdo real: ${kind} ${good ? 'OK' : '<<< PROBLEMA'}`);
    }
    if (allOk) okCount++;
    console.log(allOk ? 'RESULTADO: OK' : 'RESULTADO: PROBLEMA');
  }

  const out = path.join(__dirname, 'diagnostico-resultado.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\n${okCount}/${links.length} links OK. Detalhes salvos em ${out}`);
  app.server.close();
  process.exit(okCount === links.length ? 0 : 1);
})();
