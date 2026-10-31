'use strict';
/**
 * Reelio — baixa foto, vídeo e legenda de posts PÚBLICOS do Instagram.
 *
 * Sem dependências externas: usa apenas módulos nativos do Node (>= 18).
 *
 * Fluxo:
 *   POST /extract  { url }  -> { shortcode, type, items[], caption, username }
 *   GET  /download ?url=...&type=video|image&dl=1&name=...   (proxy com streaming + Range)
 *   GET  /health
 *   GET  /          -> index.html
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Readable, pipeline } = require('node:stream');

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;
const IG_BASE = (process.env.IG_BASE || 'https://www.instagram.com').replace(/\/+$/, '');
const IG_DOC_ID = process.env.IG_DOC_ID || '8845758582119845'; // consulta pública de post (pode mudar)
const IG_COOKIE = process.env.IG_COOKIE || ''; // opcional (veja README)
const EXTRA_MEDIA_HOSTS = (process.env.ALLOW_MEDIA_HOSTS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); // usado só nos testes
const CACHE_TTL_MS = 10 * 60 * 1000;

const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const UA_CRAWLER = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------
function codePointToChar(n, fallback) {
  try { return String.fromCodePoint(n); } catch { return fallback; }
}

/** Decodifica entidades HTML (inclui emojis em &#x1f4cc; e &#128204;). */
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => codePointToChar(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => codePointToChar(parseInt(d, 10), m))
    .replace(/&(quot|amp|lt|gt|apos|nbsp);/g, (m, n) =>
      ({ quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' }[n]));
}

/** Desfaz o escape de uma string JSON (conteúdo entre aspas), inclusive 📸 (emoji). */
function jsonUnescape(s) {
  try { return JSON.parse('"' + s + '"'); } catch { /* cai no fallback */ }
  return String(s)
    .replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\\\/g, '\\');
}

/** Limpa uma URL que veio dentro de JSON/HTML escapado. */
function cleanUrl(u) {
  return decodeEntities(String(u || ''))
    .replace(/\\+u0026/gi, '&')
    .replace(/\\+u003d/gi, '=')
    .replace(/\\+\//g, '/')
    .replace(/\\/g, '')
    .trim();
}

/** Procura  "chave":"valor"  em JSON normal ou escapado (\"chave\":\"valor\"). */
function scanString(html, key) {
  const re = new RegExp('\\\\*"' + key + '\\\\*"\\s*:\\s*\\\\*"([^"]*?)\\\\*"', 'i');
  const m = html.match(re);
  return m && m[1] ? cleanUrl(m[1]) : null;
}

/** Lê <meta property="x" content="y"> em qualquer ordem de atributos. */
function metaContent(html, prop) {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp('<meta[^>]+(?:property|name)=["\']' + p + '["\'][^>]*?content=(["\'])([\\s\\S]*?)\\1', 'i');
  const re2 = new RegExp('<meta[^>]+content=(["\'])([\\s\\S]*?)\\1[^>]*?(?:property|name)=["\']' + p + '["\']', 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[2]) : null;
}

/**
 * og:description vem como:
 *   '1,234 likes, 56 comments - user on October 14, 2026: "Legenda aqui".'
 *   '1.234 curtidas, 56 comentários - user em 14 de outubro de 2026: "Legenda aqui".'
 */
function captionFromOgDescription(desc) {
  if (!desc) return '';
  const i = desc.search(/:\s*["“]/);
  if (i < 0 || i > 220) return '';
  return desc.slice(i).replace(/^:\s*["“]/, '').replace(/["”]\.?\s*$/, '').trim();
}

/** Extrai a legenda do bloco <div class="Caption"> do embed (respeitando divs aninhadas). */
function parseEmbedCaption(html) {
  const open = html.match(/<div[^>]*class=["'][^"']*\bCaption\b[^"']*["'][^>]*>/i);
  if (!open) return '';
  const openEnd = open.index + open[0].length;
  const re = /<(\/?)div\b[^>]*>/gi;
  re.lastIndex = openEnd;
  let depth = 1, end = html.length, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) { end = m.index; break; }
  }
  let inner = html.slice(openEnd, end);
  const cut = inner.search(/<div[^>]*class=["'][^"']*Caption(?:Comments|Time|Meta|More)[^"']*["']/i);
  if (cut >= 0) inner = inner.slice(0, cut);
  inner = inner
    .replace(/<a[^>]*class=["'][^"']*CaptionUsername[^"']*["'][^>]*>[\s\S]*?<\/a>/i, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(inner).replace(/\r/g, '').replace(/^\s+|\s+$/g, '').replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------------------
// Links do Instagram
// ---------------------------------------------------------------------------
/**
 * Aceita post, reel, tv e links de compartilhamento, com qualquer parâmetro (utm_source, xtok...).
 * Retorna { shortcode, kind, videoHint } | { share: true, pathname } | null
 */
function parseInstagramUrl(raw) {
  let u;
  let text = String(raw || '').trim();
  if (text && !/^https?:\/\//i.test(text)) text = 'https://' + text; // aceita "instagram.com/reel/..."
  try { u = new URL(text); } catch { return null; }
  if (!/^(?:[a-z0-9-]+\.)*(?:instagram\.com|instagr\.am)$/i.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] && parts[0].toLowerCase() === 'share') return { share: true, pathname: u.pathname };
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i].toLowerCase();
    if (['p', 'reel', 'reels', 'tv'].includes(seg) && /^[A-Za-z0-9_-]{5,}$/.test(parts[i + 1])) {
      const kind = seg === 'reels' ? 'reel' : seg;
      return { shortcode: parts[i + 1], kind, videoHint: kind !== 'p' };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
async function httpText(url, { method = 'GET', headers = {}, body, timeout = 12000, redirect = 'follow' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const h = { ...headers };
    if (IG_COOKIE && url.startsWith(IG_BASE)) h.Cookie = IG_COOKIE;
    const res = await fetch(url, { method, headers: h, body, signal: ctrl.signal, redirect });
    const text = redirect === 'manual' ? '' : await res.text();
    return { status: res.status, text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Normalização dos dados de mídia (formato do Instagram -> nosso formato)
// ---------------------------------------------------------------------------
const isCroppedUrl = (u) => /[?&]stp=c\d+\./i.test(u);
const isTinyUrl = (u) => /[_/](?:s|p)(?:34|50|64|75|110|150|240|320)x(?:34|50|64|75|110|150|240|320)\b/i.test(u);

/** Melhor imagem: maior resolução, SEM corte quadrado (stp=c...) — evita foto cortada/esticada. */
function bestImageUrl(n) {
  const list = [];
  if (typeof n.display_url === 'string') list.push({ url: n.display_url, w: 100000 });
  for (const r of n.display_resources || []) list.push({ url: r.src, w: r.config_width || 0 });
  for (const r of (n.image_versions2 && n.image_versions2.candidates) || []) list.push({ url: r.url, w: r.width || 0 });
  const ok = list.filter((c) => c.url);
  const good = ok.filter((c) => !isCroppedUrl(c.url) && !isTinyUrl(c.url));
  const pool = good.length ? good : ok;
  pool.sort((a, b) => b.w - a.w);
  return pool[0] ? cleanUrl(pool[0].url) : null;
}

function pickVideoUrl(n) {
  if (typeof n.video_url === 'string' && n.video_url) return cleanUrl(n.video_url);
  if (Array.isArray(n.video_versions) && n.video_versions.length) {
    const v = [...n.video_versions].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    return v && v.url ? cleanUrl(v.url) : null;
  }
  return null;
}

function nodeToItem(n) {
  const isVideo = n.is_video === true || /video/i.test(n.__typename || '') ||
    typeof n.video_url === 'string' || Array.isArray(n.video_versions);
  const thumb = bestImageUrl(n);
  return isVideo ? { type: 'video', url: pickVideoUrl(n), thumb } : { type: 'image', url: thumb };
}

function normalizeNode(node) {
  const kids = (node.edge_sidecar_to_children && node.edge_sidecar_to_children.edges
    ? node.edge_sidecar_to_children.edges.map((e) => e.node) : null) || node.carousel_media || [];
  const raw = (kids.length ? kids : [node]).map(nodeToItem);
  const edge = node.edge_media_to_caption && node.edge_media_to_caption.edges && node.edge_media_to_caption.edges[0];
  const caption =
    (edge && edge.node && edge.node.text) ||
    (node.caption && typeof node.caption === 'object' ? node.caption.text : node.caption) || '';
  return {
    items: raw.filter((i) => i.url),
    videoHint: raw.some((i) => i.type === 'video'),
    caption: typeof caption === 'string' ? caption : '',
    username: (node.owner && node.owner.username) || (node.user && node.user.username) || '',
    // dado estruturado que diz explicitamente se é vídeo ou imagem = confiável
    authoritative: typeof node.is_video === 'boolean' || !!node.__typename || kids.length > 0,
  };
}

function findMediaNode(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 9) return null;
  if ((typeof o.display_url === 'string' || typeof o.video_url === 'string') &&
      (o.shortcode || o.__typename || 'is_video' in o)) return o;
  for (const k of Object.keys(o)) {
    const r = findMediaNode(o[k], depth + 1);
    if (r) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Método 1 — Embed público do post
// ---------------------------------------------------------------------------
const NOT_FOUND_RE = /quebrado|may be broken|isn['’]t available|n[aã]o est[aá] dispon[ií]vel|pode ter sido removid|may have been removed/i;
const STRONG_VIDEO_RE = /data-media-type=["']GraphVideo["']|["']is_video["']\s*:\s*true|\\*"__typename\\*"\s*:\s*\\*"(?:XDT)?GraphVideo/i;

function extractEmbedContext(html) {
  const m = html.match(/"contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) { try { return JSON.parse(jsonUnescape(m[1])); } catch { /* segue */ } }
  const m2 = html.match(/__additionalDataLoaded\(\s*['"][^'"]*['"]\s*,\s*(\{[\s\S]*?\})\s*\)\s*;?\s*<\/script>/);
  if (m2) { try { return JSON.parse(m2[1]); } catch { /* segue */ } }
  return null;
}

function embedImage(html) {
  const tag = html.match(/<img[^>]*EmbeddedMediaImage[^>]*>/i);
  if (!tag) return null;
  const src = tag[0].match(/\ssrc=(["'])([\s\S]*?)\1/i);
  return src ? cleanUrl(src[2]) : null;
}

function parseEmbed(html, parsed) {
  const ctx = extractEmbedContext(html);
  const node = ctx ? findMediaNode(ctx) : null;
  const r = node
    ? normalizeNode(node)
    : { items: [], videoHint: false, caption: '', username: '', authoritative: false };

  if (!r.items.length) {
    const vurl = scanString(html, 'video_url');
    const img = embedImage(html) || scanString(html, 'display_url');
    const strongVideo = !!vurl || STRONG_VIDEO_RE.test(html);
    if (vurl) r.items = [{ type: 'video', url: vurl, thumb: img }];
    else if (img && !strongVideo && !parsed.videoHint) r.items = [{ type: 'image', url: img }];
    r.videoHint = r.videoHint || strongVideo;
  }
  r.caption = r.caption || parseEmbedCaption(html);

  if (!r.items.length && !r.videoHint && !r.caption && NOT_FOUND_RE.test(html)) {
    return { ok: false, notFound: true, note: 'embed informa que o post não está disponível', ...r };
  }
  return { ok: r.items.length > 0, ...r, note: node ? 'dados estruturados' : 'HTML do embed' };
}

async function viaEmbed(parsed) {
  const res = await httpText(`${IG_BASE}/p/${parsed.shortcode}/embed/captioned/`, {
    headers: { 'User-Agent': UA_DESKTOP, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
  });
  if (res.status !== 200) return { ok: false, status: res.status, note: `HTTP ${res.status}` };
  if (res.text.length < 500) return { ok: false, status: 200, note: 'resposta vazia' };
  return { status: 200, ...parseEmbed(res.text, parsed) };
}

// ---------------------------------------------------------------------------
// Método 2 — Consulta GraphQL pública (traz carrossel completo e legenda exata)
// ---------------------------------------------------------------------------
async function viaGraphql(parsed) {
  const friendly = 'PolarisPostActionLoadPostQueryQuery';
  const variables = JSON.stringify({
    shortcode: parsed.shortcode, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null,
  });
  const body = new URLSearchParams({
    av: '0', __d: 'www', __user: '0', __a: '1', __req: '3', dpr: '2',
    lsd: 'AVqbxe3J_YA', fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: friendly,
    variables, server_timestamps: 'true', doc_id: IG_DOC_ID,
  }).toString();
  const res = await httpText(`${IG_BASE}/graphql/query`, {
    method: 'POST', body,
    headers: {
      'User-Agent': UA_DESKTOP, 'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-LSD': 'AVqbxe3J_YA', 'X-IG-App-ID': '936619743392459', 'X-ASBD-ID': '129477',
      'X-FB-Friendly-Name': friendly, 'Sec-Fetch-Site': 'same-origin',
      'Origin': IG_BASE, 'Referer': `${IG_BASE}/p/${parsed.shortcode}/`, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  if (res.status !== 200) return { ok: false, status: res.status, note: `HTTP ${res.status}` };
  let json;
  try { json = JSON.parse(res.text.replace(/^for \(;;\);/, '')); } catch { return { ok: false, status: 200, note: 'resposta não é JSON (login/bloqueio?)' }; }
  const media = json && json.data && (json.data.xdt_shortcode_media || json.data.shortcode_media);
  if (!media) return { ok: false, status: 200, note: 'sem dados do post (exige login ou bloqueou o servidor)' };
  const r = normalizeNode(media);
  return { status: 200, ok: r.items.length > 0, ...r, note: 'GraphQL' };
}

// ---------------------------------------------------------------------------
// Método 3 — Metadados OpenGraph (como o crawler do Facebook enxerga a página)
// ---------------------------------------------------------------------------
async function viaOpenGraph(parsed) {
  const res = await httpText(`${IG_BASE}/${parsed.kind}/${parsed.shortcode}/`, {
    headers: { 'User-Agent': UA_CRAWLER, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
  });
  if (res.status !== 200) return { ok: false, status: res.status, note: `HTTP ${res.status}` };
  const html = res.text;
  const ogVideo = metaContent(html, 'og:video:secure_url') || metaContent(html, 'og:video') || scanString(html, 'video_url');
  const ogImage = metaContent(html, 'og:image');
  const ogType = metaContent(html, 'og:type') || '';
  const caption = captionFromOgDescription(metaContent(html, 'og:description') || metaContent(html, 'description'));
  if (!ogVideo && !ogImage && !caption) return { ok: false, status: 200, note: 'sem metadados (login exigido?)' };
  const videoHint = !!ogVideo || /video/i.test(ogType);
  let items = [];
  if (ogVideo) items = [{ type: 'video', url: cleanUrl(ogVideo), thumb: ogImage ? cleanUrl(ogImage) : null }];
  else if (ogImage && !videoHint && !parsed.videoHint) items = [{ type: 'image', url: cleanUrl(ogImage) }];
  return { status: 200, ok: items.length > 0, items, caption, username: '', videoHint, authoritative: false, note: 'OpenGraph' };
}

// ---------------------------------------------------------------------------
// Orquestrador
// ---------------------------------------------------------------------------
const cache = new Map();      // shortcode -> { at, data }
const inflight = new Map();   // shortcode -> Promise

function getCached(code) {
  const e = cache.get(code);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) { cache.delete(code); return null; }
  return e.data;
}
setInterval(() => { for (const [k, v] of cache) if (Date.now() - v.at > CACHE_TTL_MS) cache.delete(k); }, 5 * 60 * 1000).unref();

const hasVideo = (r) => r.items.some((i) => i.type === 'video');
/** Resultado completo = tem mídia e, se é vídeo/reel, tem o ARQUIVO de vídeo (nunca só a capa). */
const isComplete = (r, needVideo) => r.items.length > 0 && (!needVideo || hasVideo(r));

async function runExtraction(parsed, trace) {
  const methods = [
    ['embed', viaEmbed],
    ['graphql', viaGraphql],
    ['opengraph', viaOpenGraph],
  ];
  let caption = '', captionAuth = false, username = '', best = null, tentative = null, notFound = false;
  let needVideo = parsed.videoHint;

  for (const [name, fn] of methods) {
    const t0 = Date.now();
    let r;
    try { r = await fn(parsed); } catch (e) { r = { ok: false, note: e.name === 'AbortError' ? 'tempo esgotado' : e.message }; }
    r.items = r.items || [];
    trace.push({ method: name, ms: Date.now() - t0, status: r.status || null, items: r.items.length, video: !!r.videoHint, note: r.note || '' });

    if (r.notFound) { notFound = true; break; }
    // legenda: a de dado estruturado (exata) vence a de HTML; o OpenGraph (pode vir truncada) fica por último
    if (r.caption && (!caption || (r.authoritative && !captionAuth))) { caption = r.caption; captionAuth = !!r.authoritative; }
    if (r.username && !username) username = r.username;
    if (r.videoHint) { needVideo = true; tentative = null; }

    if (isComplete(r, needVideo)) {
      // Imagem sem confirmação estruturada pode ser a capa de um vídeo: confere com os outros métodos.
      if (r.authoritative || hasVideo(r)) { best = r; break; }
      if (!tentative) tentative = r;
    }
  }
  if (!best && tentative && !needVideo) best = tentative;

  if (best) {
    const items = best.items;
    const type = items.length > 1 ? 'carousel' : items[0].type;
    return { status: 200, body: { shortcode: parsed.shortcode, type, items, caption: caption || best.caption || '', username } };
  }
  if (notFound) {
    return { status: 404, body: { error: 'Este post não está disponível. Confira se o link está completo, se a conta é pública e se o post não foi apagado.' } };
  }
  if (needVideo) {
    return { status: 422, body: { error: 'É um vídeo/reel, mas o Instagram não liberou o arquivo de vídeo agora. Tente novamente em instantes.' } };
  }
  return { status: 422, body: { error: 'Não consegui extrair a mídia desse link. Verifique se o post é público e tente novamente.' } };
}

async function extractPost(parsed, trace) {
  const cached = getCached(parsed.shortcode);
  if (cached) { trace.push({ method: 'cache', ms: 0, note: 'resultado em cache' }); return { status: 200, body: cached }; }
  if (inflight.has(parsed.shortcode)) return inflight.get(parsed.shortcode);
  const p = runExtraction(parsed, trace).then((out) => {
    if (out.status === 200) cache.set(parsed.shortcode, { at: Date.now(), data: out.body });
    return out;
  }).finally(() => inflight.delete(parsed.shortcode));
  inflight.set(parsed.shortcode, p);
  return p;
}

async function resolveShare(parsed) {
  const res = await httpText(IG_BASE + parsed.pathname, { headers: { 'User-Agent': UA_DESKTOP }, redirect: 'manual', timeout: 8000 });
  let loc = res.headers.get('location') || '';
  if (/[?&]next=/.test(loc)) { try { loc = decodeURIComponent(new URL(loc, IG_BASE).searchParams.get('next') || loc); } catch { /* segue */ } }
  return parseInstagramUrl(new URL(loc, 'https://www.instagram.com').href);
}

// ---------------------------------------------------------------------------
// Proxy de download
// ---------------------------------------------------------------------------
function isAllowedMediaUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  const host = u.hostname.toLowerCase();
  if (EXTRA_MEDIA_HOSTS.includes(host)) return true;             // só nos testes
  if (u.protocol !== 'https:') return false;
  return /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(host);     // evita virar proxy aberto
}

const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

async function handleDownload(req, res, q) {
  const mediaUrl = q.get('url');
  if (!mediaUrl || !isAllowedMediaUrl(mediaUrl)) return sendJson(res, 400, { error: 'Endereço de mídia inválido.' });
  const wantVideo = q.get('type') === 'video';

  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  const headerTimer = setTimeout(() => ctrl.abort(), 25000);
  const headers = { 'User-Agent': UA_DESKTOP, 'Accept': '*/*', 'Referer': 'https://www.instagram.com/' };
  if (req.headers.range) headers.Range = req.headers.range;

  let up;
  try {
    up = await fetch(mediaUrl, { headers, signal: ctrl.signal, redirect: 'follow' });
  } catch (e) {
    clearTimeout(headerTimer);
    if (res.destroyed) return;
    return sendJson(res, 502, { error: 'Não consegui baixar a mídia do Instagram agora.' });
  }
  clearTimeout(headerTimer);
  if (!up.ok && up.status !== 206) {
    return sendJson(res, 502, { error: `O Instagram recusou o arquivo (HTTP ${up.status}). O link pode ter expirado: busque o post de novo.` });
  }

  // Tipo real vem do servidor da mídia; o parâmetro só desempata.
  let mime = (up.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^(image|video)\//.test(mime)) mime = wantVideo ? 'video/mp4' : 'image/jpeg';
  const ext = EXT_BY_MIME[mime] || (mime.startsWith('video/') ? 'mp4' : 'jpg');
  const base = (q.get('name') || 'reelio').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'reelio';

  res.statusCode = up.status;
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `${q.get('dl') === '1' ? 'attachment' : 'inline'}; filename="${base}.${ext}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=600');
  for (const h of ['content-length', 'content-range', 'accept-ranges']) {
    const v = up.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  if (!up.body) return res.end();
  pipeline(Readable.fromWeb(up.body), res, () => { /* cliente cancelou: ok */ });
}

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------
function sendJson(res, status, obj) {
  if (res.headersSent) return res.end();
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJson(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('corpo grande demais')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}

const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some((t) => now - t < 120000)) hits.delete(k); }, 60000).unref();

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

async function handleExtract(req, res, debug) {
  if (limited('x:' + clientIp(req), 30, 60000)) return sendJson(res, 429, { error: 'Muitas buscas seguidas. Aguarde um minuto.' });
  let body;
  try { body = await readJson(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }

  let parsed = parseInstagramUrl(body.url);
  if (!parsed) return sendJson(res, 400, { error: 'Cole um link válido de post ou reel do Instagram (ex.: instagram.com/reel/... ou instagram.com/p/...).' });
  const trace = [];
  if (parsed.share) {
    try { parsed = await resolveShare(parsed); } catch { parsed = null; }
    if (!parsed || parsed.share) return sendJson(res, 422, { error: 'Não consegui abrir esse link de compartilhamento. Copie o link do post pelo navegador.' });
  }
  const t0 = Date.now();
  let out;
  try { out = await extractPost(parsed, trace); } catch (e) { out = { status: 500, body: { error: 'Erro interno ao processar o link.' } }; trace.push({ method: 'erro', note: e.message }); }
  console.log(`[extract] ${parsed.shortcode} -> ${out.status} ${out.body.type || ''} ${Date.now() - t0}ms ${JSON.stringify(trace.map((t) => `${t.method}:${t.items ?? '-'}${t.status ? '/' + t.status : ''}`))}`);
  if (out.status !== 200 || debug) out.body.trace = trace;
  sendJson(res, out.status, out.body);
}

function serveIndex(res) {
  fs.readFile(path.join(__dirname, 'index.html'), (err, buf) => {
    if (err) return sendJson(res, 500, { error: 'index.html não encontrado' });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = `${req.method} ${url.pathname}`;
  Promise.resolve().then(() => {
    switch (route) {
      case 'GET /': case 'GET /index.html': return serveIndex(res);
      case 'GET /health': return sendJson(res, 200, { ok: true });
      case 'GET /favicon.ico': res.writeHead(204); return res.end();
      case 'POST /extract': return handleExtract(req, res, url.searchParams.get('debug') === '1');
      case 'GET /download':
        if (limited('d:' + clientIp(req), 200, 60000)) return sendJson(res, 429, { error: 'Muitas requisições.' });
        return handleDownload(req, res, url.searchParams);
      default: return sendJson(res, 404, { error: 'Não encontrado.' });
    }
  }).catch((e) => { console.error('[erro]', e); sendJson(res, 500, { error: 'Erro interno.' }); });
});
server.requestTimeout = 0; // downloads de vídeo podem demorar
server.keepAliveTimeout = 65000;

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`Reelio rodando na porta ${PORT}`));
}

module.exports = {
  server, parseInstagramUrl, parseEmbed, parseEmbedCaption, captionFromOgDescription,
  decodeEntities, normalizeNode, bestImageUrl, isAllowedMediaUrl, runExtraction, cache,
};
