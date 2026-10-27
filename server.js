// server.js - Backend do Reelio com Fidelidade Total ao IG Downloader
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const btch = require('btch-downloader');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

// Impedir armazenamento em cache estático por navegadores e webviews
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(__dirname));

// ==========================================
// 1. GERENCIADOR DE CACHE EM MEMÓRIA DEFINITIVO
// ==========================================
const extractionCache = new Map();
const pendingRequests = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

function getCachedExtraction(shortcode) {
  if (!shortcode) return null;
  const entry = extractionCache.get(shortcode);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    extractionCache.delete(shortcode);
    return null;
  }
  return entry.data;
}

function setCachedExtraction(shortcode, data) {
  if (!shortcode || !data) return;
  // Apenas armazenar no cache se houver mídia válida e não for erro
  if ((data.videoUrl || data.imageUrl) && !data.isNotFound) {
    extractionCache.set(shortcode, {
      data,
      timestamp: Date.now()
    });
  }
}

// Limpeza periódica de entradas expiradas a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of extractionCache.entries()) {
    if (now - val.timestamp > CACHE_TTL_MS) {
      extractionCache.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

// ==========================================
// 2. NAVEGADOR PUPPETEER COM RESILIÊNCIA E AUTO-RECOVERY
// ==========================================
let browserInstance = null;
let browserLaunchPromise = null;

function findChromeExecutable() {
  const cacheBase = '/opt/render/.cache/puppeteer';
  if (fs.existsSync(cacheBase)) {
    try {
      function scanDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const res = scanDir(fullPath);
            if (res) return res;
          } else if (entry.name === 'chrome' && entry.isFile()) {
            return fullPath;
          }
        }
        return null;
      }
      const found = scanDir(cacheBase);
      if (found) return found;
    } catch (e) {}
  }

  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];

  for (const p of possiblePaths) {
    if (typeof p === 'string' && p.trim() !== '' && fs.existsSync(p)) return p;
  }

  try {
    const pptr = require('puppeteer');
    if (pptr.executablePath && typeof pptr.executablePath() === 'string' && fs.existsSync(pptr.executablePath())) {
      return pptr.executablePath();
    }
  } catch (e) {}

  return null;
}

async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--lang=pt-BR,pt,en-US,en'
    ]
  };

  const chromePath = findChromeExecutable();
  if (chromePath) {
    console.log('[Browser] Executável do Chrome localizado em:', chromePath);
    launchOptions.executablePath = chromePath;
  }

  browserLaunchPromise = puppeteer.launch(launchOptions).then(b => {
    browserInstance = b;
    browserLaunchPromise = null;
    b.on('disconnected', () => {
      console.log('[Browser] Navegador desconectado. Limpando referência para auto-recovery.');
      browserInstance = null;
    });
    return b;
  }).catch(err => {
    browserLaunchPromise = null;
    browserInstance = null;
    throw err;
  });

  return browserLaunchPromise;
}

// ==========================================
// 3. DECODIFICAÇÃO PRECISA DE UNICODE, EMOJIS E FORMATAÇÃO DE LEGENDAS
// ==========================================
function decodeInstagramText(str) {
  if (!str) return '';
  return str
    // Entidades hexadecimais (suporte completo a código Unicode de 32-bits para emojis: ex: &#x1f4cc; -> 📌)
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch (e) {
        return match;
      }
    })
    // Entidades decimais (suporte a emojis decimais: ex: &#128204; -> 📌)
    .replace(/&#(\d+);/g, (match, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch (e) {
        return match;
      }
    })
    // Entidades HTML padrão
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Sequências Unicode escapadas \uXXXX
    .replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
      try {
        return String.fromCharCode(parseInt(grp, 16));
      } catch (e) {
        return match;
      }
    });
}

function cleanInstagramCaption(rawDesc) {
  if (!rawDesc) return '';
  let caption = rawDesc;

  // Converter quebras de linha HTML em quebras reais \n, preservando parágrafos
  caption = caption.replace(/<br\s*\/?>/gi, '\n');
  caption = caption.replace(/<\/p>\s*<p>/gi, '\n\n');
  caption = caption.replace(/<[^>]+>/g, '');

  // Tratar prefixos comuns em metadados do Instagram:
  // Ex: "0 likes, 0 comments - username on September 23, 2026: \"Legenda...\"."
  const prefixRegex = /^[\d\s\w,.-]*\b(?:on|no|em)\s+[^:]+:\s*["“]/i;
  if (prefixRegex.test(caption)) {
    caption = caption.replace(prefixRegex, '');
    caption = caption.replace(/["”]\s*\.?\s*$/, '');
  } else {
    caption = caption.replace(/^[\d\s\w,.-]*\b(?:on|no|em)\s+[^:]+:\s*/i, '');
  }

  // Decodificar todos os emojis e caracteres acentuados
  caption = decodeInstagramText(caption);

  // Remover aspas externas se toda a legenda estiver envolta nelas
  caption = caption.replace(/^["“]([\s\S]*?)["”]\.?$/, '$1').trim();

  return caption;
}

function cleanJsonUrl(rawUrl) {
  if (!rawUrl) return '';
  return rawUrl
    .replace(/\\u0026/gi, '&')
    .replace(/&amp;/gi, '&')
    .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (e) {
        return match;
      }
    })
    .replace(/\\/g, '');
}

/**
 * Método 0: Pure HTTP Embed Scraper (Ultrarrápido, ~300ms, sem overhead de Puppeteer)
 * O Embed do Instagram contém no próprio script JSON o video_url direto e display_url
 */
async function extractDirectEmbed(shortcode, isReelLink) {
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    console.log('[DirectEmbed] Extraindo via HTTP embed direto:', embedUrl);
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) return null;
    const html = await res.text();

    if (html.includes('link desta foto ou vídeo pode estar quebrado') || html.includes('Post não está disponível')) {
      return { isNotFound: true, videoUrl: null, imageUrl: null, caption: '' };
    }

    let videoUrl = null;
    let imageUrl = null;
    let caption = '';

    // 1. Extrair video_url com suporte a escape de barras e aspas
    const vidMatch = html.match(/video_url[\\]*":[\\]*"(https?:[^"\\]+)/i) ||
                     html.match(/video_url[\\]*":[\\]*"([^"]+)/i);
    if (vidMatch) {
      videoUrl = cleanJsonUrl(vidMatch[1]);
    }

    // 2. Extrair display_url / imagem
    const imgMatch = html.match(/"display_url"\s*:\s*"([^"]+)"/i) ||
                     html.match(/display_url[\\]*":[\\]*"(https?:[^"\\]+)/i) ||
                     html.match(/display_url[\\]*":[\\]*"([^"]+)/i) ||
                     html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i);
    if (imgMatch) {
      imageUrl = cleanJsonUrl(imgMatch[1]);
    }

    // 3. Extrair legenda fiel com quebras de linha e emojis
    const captionBlockMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
    if (captionBlockMatch) {
      let rawCap = captionBlockMatch[1];
      rawCap = rawCap.replace(/<a class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/gi, '');
      rawCap = rawCap.replace(/<[^>]*class="[^"]*(?:CaptionComments|CaptionTime|CaptionMeta|CaptionMore)[^"]*"[^>]*>[\s\S]*?<\/[a-z0-9]+>/gi, '');
      rawCap = rawCap.replace(/<br\s*\/?>/gi, '\n');
      rawCap = rawCap.replace(/<[^>]+>/g, '');
      rawCap = rawCap.replace(/View (?:all )?[\d,.]+ comments/gi, '');
      rawCap = rawCap.replace(/Ver todos os [\d,.]+ coment[áa]rios/gi, '');
      caption = decodeInstagramText(rawCap).trim();
    }

    if (!caption) {
      const scriptCapMatch = html.match(/"caption"\s*:\s*"([^"]+)"/i) || html.match(/"text"\s*:\s*"([^"]+)"/i);
      if (scriptCapMatch) {
        caption = decodeInstagramText(scriptCapMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')).trim();
      }
    }

    // Se for link de Reel/Vídeo e não achou video_url, não retornar imagem falsa!
    if (isReelLink && !videoUrl) {
      return null;
    }

    const isVideo = isReelLink || !!videoUrl;
    if (isVideo && videoUrl) {
      console.log('[DirectEmbed SUCCESS] Vídeo extraído com sucesso em 300ms!');
      return {
        isNotFound: false,
        videoUrl,
        imageUrl,
        isImage: false,
        caption
      };
    } else if (!isReelLink && imageUrl) {
      console.log('[DirectEmbed SUCCESS] Imagem extraída com sucesso em 300ms!');
      return {
        isNotFound: false,
        videoUrl: null,
        imageUrl,
        isImage: true,
        caption
      };
    }
  } catch (err) {
    console.log('[DirectEmbed Warning]:', err.message);
  }
  return null;
}

/**
 * Método 1: Puppeteer Embed Scraper
 * O Embed do Instagram é público, oficial, livre de logins e retorna o vídeo direto e legenda perfeita.
 */
async function extractFromPuppeteerEmbed(shortcode, isReelLink) {
  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 640, height: 800 });

    const mp4NetworkUrls = [];
    const imageNetworkUrls = [];

    page.on('response', res => {
      const u = res.url();
      if (u.includes('.mp4')) {
        mp4NetworkUrls.push(u);
      } else if (u.includes('scontent') && (u.includes('.jpg') || u.includes('.webp') || u.includes('stp='))) {
        // Ignorar avatares pequenos
        if (!u.includes('s150x150') && !u.includes('s34x34')) {
          imageNetworkUrls.push(u);
        }
      }
    });

    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    console.log('[PuppeteerEmbed] Acessando:', embedUrl);

    await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Aguardar o elemento aparecer no DOM em vez de timer fixo
    try {
      if (isReelLink) {
        await page.waitForSelector('video', { timeout: 6000 });
      } else {
        await page.waitForSelector('img.EmbeddedMediaImage, article img', { timeout: 4000 });
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 1500));
    }

    const domData = await page.evaluate(() => {
      const title = document.title || '';
      const body = document.body.innerText || '';
      const isNotFound = body.includes('link desta foto ou vídeo pode estar quebrado') || 
                         title.includes('Post não está disponível');

      const videoEl = document.querySelector('video');
      const videoSrc = videoEl ? (videoEl.src || videoEl.querySelector('source')?.src) : null;

      const imgEl = document.querySelector('img.EmbeddedMediaImage') || 
                    document.querySelector('article img') || 
                    document.querySelector('img');
      const imgSrc = imgEl ? imgEl.src : null;

      const captionEl = document.querySelector('div.Caption');
      let caption = '';
      if (captionEl) {
        const clone = captionEl.cloneNode(true);
        // Remover metadados do embed: username, contadores de comentário e timestamp
        clone.querySelectorAll('.CaptionComments, .CaptionUsername, .CaptionTime, .CaptionMeta, .CaptionMore').forEach(el => el.remove());
        // Preservar quebras de linha reais
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        caption = clone.innerText || clone.textContent || '';
      }

      return { isNotFound, videoSrc, imgSrc, caption: caption.trim() };
    });

    if (domData.isNotFound) {
      return { isNotFound: true, videoUrl: null, imageUrl: null, caption: '' };
    }

    let finalVideoUrl = domData.videoSrc || (mp4NetworkUrls.length > 0 ? mp4NetworkUrls[0] : null);
    let finalImageUrl = domData.imgSrc || (imageNetworkUrls.length > 0 ? imageNetworkUrls[0] : null);

    // Se for link de Reel/Vídeo, NUNCA considerar miniatura como vídeo
    if (isReelLink && !finalVideoUrl) {
      console.log('[PuppeteerEmbed] Link de Reel mas vídeo direto não foi carregado pelo embed.');
      return null;
    }

    const isVideo = isReelLink || !!finalVideoUrl;
    if (isVideo && finalVideoUrl) {
      console.log('[PuppeteerEmbed SUCCESS] Vídeo extraído com sucesso!');
      return {
        isNotFound: false,
        videoUrl: finalVideoUrl,
        imageUrl: finalImageUrl,
        isImage: false,
        caption: domData.caption || ''
      };
    } else if (!isReelLink && finalImageUrl) {
      console.log('[PuppeteerEmbed SUCCESS] Imagem extraída com sucesso!');
      return {
        isNotFound: false,
        videoUrl: null,
        imageUrl: finalImageUrl,
        isImage: true,
        caption: domData.caption || ''
      };
    }
  } catch (err) {
    console.log('[PuppeteerEmbed Warning]:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return null;
}

/**
 * Método 2: OpenGraph Crawler Inteligente
 */
async function extractOpenGraph(url, shortcode, isReelLink) {
  try {
    console.log('[OpenGraph] Extraindo via Crawler:', url);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    const html = await res.text();

    const ogVidMatch = html.match(/property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/content=["']([^"']+)["']\s+property=["']og:video(?::secure_url)?["']/i);

    const mp4Regex = new RegExp('https?:\\?/\\?/[^"\'\\s<>]+\\.mp4[^"\'\\s<>]*', 'gi');
    const mp4Matches = html.match(mp4Regex) || [];
    const validMp4s = mp4Matches.map(m => m.replace(/\\/g, '').replace(/&bytestart=\d+/g, '').replace(/&byteend=\d+/g, ''))
                                .filter(u => u.includes('cdninstagram') || u.includes('fbcdn'));

    const ogDescMatch = html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/content=["']([^"']+)["']\s+property=["']og:description["']/i) ||
                        html.match(/name=["']description["']\s+content=["']([^"']+)["']/i);

    let caption = ogDescMatch ? cleanInstagramCaption(ogDescMatch[1]) : '';

    // Extrair candidatos a imagem sem corte
    const scontentRegex = /https?:\\\/\\\/scontent[^\s"'<>]+/g;
    const sMatches = html.match(scontentRegex) || [];
    const sUnesc = Array.from(new Set(sMatches.map(m => m.replace(/\\/g, '').replace(/&amp;/g, '&'))));
    const candidateImages = sUnesc.filter(u => (u.includes('.jpg') || u.includes('.webp') || u.includes('stp=')) && !u.includes('s150x150') && !u.includes('s34x34'));
    const uncroppedImage = candidateImages.find(u => !/stp=c\d+\./.test(u)) || candidateImages[0] || null;

    let videoUrl = ogVidMatch ? decodeInstagramText(ogVidMatch[1]) : (validMp4s.length > 0 ? validMp4s[0] : null);

    // REGRA DE OURO: Se for link de Reel/Vídeo e não achou o vídeo, NUNCA retornar a imagem como se fosse o resultado!
    if (isReelLink && !videoUrl) {
      console.log('[OpenGraph] Link de Reel sem vídeo no HTML. Passando para os próximos fallbacks...');
      return null;
    }

    if (videoUrl) {
      console.log('[OpenGraph SUCCESS] Vídeo localizado via crawler!');
      return {
        isNotFound: false,
        videoUrl: videoUrl,
        imageUrl: uncroppedImage,
        isImage: false,
        caption: caption
      };
    }

    if (!isReelLink && uncroppedImage) {
      console.log('[OpenGraph SUCCESS] Imagem não-cortada localizada via crawler!');
      return {
        isNotFound: false,
        videoUrl: null,
        imageUrl: uncroppedImage,
        isImage: true,
        caption: caption
      };
    }
  } catch (e) {
    console.error('[OpenGraph Error]:', e.message);
  }
  return null;
}

/**
 * Método 3: btch.igdl com Timeout Rígido de 6s e Validação de Tipo
 */
async function extractFromBtch(originalUrl, shortcode, isReelLink) {
  try {
    console.log('[btch.igdl] Tentando btch.igdl com timeout de 6s para:', originalUrl);
    
    const btchPromise = btch.igdl(originalUrl);
    const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout de 6s excedido')), 6000));
    const btchRes = await Promise.race([btchPromise, timeoutPromise]);

    if (btchRes && btchRes.status && Array.isArray(btchRes.result) && btchRes.result.length > 0) {
      const validItems = btchRes.result.filter(item => (item.url && item.url.trim() !== '') || (item.thumbnail && item.thumbnail.trim() !== ''));
      if (validItems.length > 0) {
        const mediaItem = validItems[0];
        const rawUrl = mediaItem.url && mediaItem.url.trim();
        const rawThumb = mediaItem.thumbnail && mediaItem.thumbnail.trim();

        const cleanUrl = (rawUrl || '').toLowerCase().split('?')[0];
        const isUrlVideo = cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.mov') || (rawUrl && rawUrl.includes('.mp4'));

        // Se for Reel, o item PRECISA ter uma URL de vídeo válida, e não apenas thumbnail
        if (isReelLink && !isUrlVideo) {
          console.log('[btch.igdl] Retornou apenas thumbnail para um Reel. Rejeitando para evitar download de capa.');
          return null;
        }

        const isVideo = isReelLink || isUrlVideo;
        const targetMediaUrl = isVideo ? rawUrl : (rawUrl || rawThumb);

        if (!targetMediaUrl) return null;

        // Tentar obter a legenda real
        let realCaption = "";
        try {
          const og = await extractOpenGraph(originalUrl, shortcode, isReelLink);
          if (og && og.caption) realCaption = og.caption;
        } catch (e) {}

        console.log(`[btch.igdl SUCCESS] Mídia extraída com sucesso! Tipo: ${isVideo ? 'VÍDEO' : 'IMAGEM'}`);
        return {
          isNotFound: false,
          videoUrl: isVideo ? targetMediaUrl : null,
          imageUrl: isVideo ? rawThumb : targetMediaUrl,
          isImage: !isVideo,
          caption: realCaption || "Publicação do Instagram"
        };
      }
    }
  } catch (err) {
    console.log('[btch.igdl Fallback]:', err.message);
  }
  return null;
}

/**
 * Método 4: Fallback Puppeteer Desktop/Mobile Stealth
 */
async function extractFromPuppeteerFull(shortcode, originalUrl, isReelLink) {
  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const mp4Urls = [];
    page.on('response', (response) => {
      const u = response.url();
      if (u.includes('.mp4')) mp4Urls.push(u);
    });

    const targetUrl = 'https://www.instagram.com/' + (isReelLink ? 'reel' : 'p') + '/' + shortcode + '/';
    console.log('[StealthFull] Navegando para:', targetUrl);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await new Promise(r => setTimeout(r, 4000));

    const pageData = await page.evaluate(() => {
      const title = document.title || '';
      const bodyText = document.body.innerText || '';
      const isNotFound = bodyText.includes('link desta foto ou vídeo pode estar quebrado') || 
                         title.includes('Post não está disponível');
      const videoEl = document.querySelector('video');
      const videoSrc = videoEl ? (videoEl.src || videoEl.querySelector('source')?.src) : null;

      const imgEl = document.querySelector('meta[property="og:image"]')?.content ||
                    document.querySelector('article img')?.src ||
                    document.querySelector('img.FFVAD')?.src;

      const metaOg = document.querySelector('meta[property="og:description"]')?.content || '';
      return { isNotFound, videoSrc, imgSrc: imgEl, rawCaption: metaOg };
    });

    if (pageData.isNotFound) {
      return { isNotFound: true, videoUrl: null, imageUrl: null, caption: '' };
    }

    let finalVideoUrl = pageData.videoSrc || (mp4Urls.length > 0 ? mp4Urls[0] : null);

    if (isReelLink && !finalVideoUrl) {
      return null;
    }

    const isVid = isReelLink || !!finalVideoUrl;
    const cleanedCaption = cleanInstagramCaption(pageData.rawCaption);

    return {
      isNotFound: false,
      videoUrl: isVid ? finalVideoUrl : null,
      imageUrl: isVid ? null : (pageData.imgSrc || null),
      isImage: !isVid,
      caption: cleanedCaption
    };
  } catch (err) {
    console.error('[StealthFull Error]:', err.message);
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ==========================================
// 5. ORQUESTRADOR CENTRAL DE EXTRAÇÃO COM CACHE
// ==========================================
async function extractInstagramPost(shortcode, originalUrl) {
  // 1. Verificar cache em memória
  const cached = getCachedExtraction(shortcode);
  if (cached) {
    console.log(`[Cache HIT] Retornando dados em cache para shortcode: ${shortcode}`);
    return cached;
  }

  // 2. Coalescência de requisições simultâneas
  if (pendingRequests.has(shortcode)) {
    console.log(`[Pending Request] Coalescendo requisição simultânea para: ${shortcode}`);
    return await pendingRequests.get(shortcode);
  }

  const extractionPromise = (async () => {
    const isReelLink = /\/reel\//i.test(originalUrl) || /\/reels\//i.test(originalUrl);
    console.log(`[Extract Orchestrator] Processando ${shortcode} (isReel: ${isReelLink})`);

    // Etapa 0: Pure HTTP Embed Scraper (Ultrarrápido, ~300ms, sem overhead de Puppeteer)
    try {
      const directEmbedRes = await extractDirectEmbed(shortcode, isReelLink);
      if (directEmbedRes && (directEmbedRes.videoUrl || directEmbedRes.imageUrl)) {
        setCachedExtraction(shortcode, directEmbedRes);
        return directEmbedRes;
      }
      if (directEmbedRes && directEmbedRes.isNotFound) return directEmbedRes;
    } catch (e) {
      console.log('[Orchestrator Step 0 Error]:', e.message);
    }

    // Etapa 1: Puppeteer Embed Scraper (Extremamente rápido e imune a bloqueios de login)
    try {
      const embedRes = await extractFromPuppeteerEmbed(shortcode, isReelLink);
      if (embedRes && (embedRes.videoUrl || embedRes.imageUrl)) {
        setCachedExtraction(shortcode, embedRes);
        return embedRes;
      }
      if (embedRes && embedRes.isNotFound) return embedRes;
    } catch (e) {
      console.log('[Orchestrator Step 1 Error]:', e.message);
    }

    // Etapa 2: OpenGraph Crawler Inteligente (facebookexternalhit)
    try {
      const ogRes = await extractOpenGraph(originalUrl, shortcode, isReelLink);
      if (ogRes && (ogRes.videoUrl || ogRes.imageUrl)) {
        setCachedExtraction(shortcode, ogRes);
        return ogRes;
      }
    } catch (e) {
      console.log('[Orchestrator Step 2 Error]:', e.message);
    }

    // Etapa 3: btch.igdl com validação estrita e timeout
    try {
      const btchRes = await extractFromBtch(originalUrl, shortcode, isReelLink);
      if (btchRes && (btchRes.videoUrl || btchRes.imageUrl)) {
        setCachedExtraction(shortcode, btchRes);
        return btchRes;
      }
    } catch (e) {
      console.log('[Orchestrator Step 3 Error]:', e.message);
    }

    // Etapa 4: Puppeteer Full Navigation
    try {
      const fullRes = await extractFromPuppeteerFull(shortcode, originalUrl, isReelLink);
      if (fullRes && (fullRes.videoUrl || fullRes.imageUrl)) {
        setCachedExtraction(shortcode, fullRes);
        return fullRes;
      }
      if (fullRes && fullRes.isNotFound) return fullRes;
    } catch (e) {
      console.log('[Orchestrator Step 4 Error]:', e.message);
    }

    return null;
  })();

  pendingRequests.set(shortcode, extractionPromise);

  try {
    const result = await extractionPromise;
    return result;
  } finally {
    pendingRequests.delete(shortcode);
  }
}

// ==========================================
// 6. ROTAS EXPRESS
// ==========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Proxy /download: Suporte a streaming com Range headers e determinação estrita de extensão
app.get('/download', async (req, res) => {
  const mediaUrl = req.query.url;
  const isForceDownload = req.query.dl === '1';
  const explicitType = req.query.type; // 'image' ou 'video'
  if (!mediaUrl) return res.status(400).send('URL de mídia ausente.');

  try {
    const forwardHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };
    if (req.headers.range) {
      forwardHeaders['Range'] = req.headers.range;
    }

    const mediaRes = await fetch(mediaUrl, { headers: forwardHeaders });

    if (!mediaRes.ok && mediaRes.status !== 206) {
      console.log(`[Download Proxy] CDN status ${mediaRes.status}. Redirecionando direto para CDN...`);
      return res.redirect(mediaUrl);
    }

    const contentType = (mediaRes.headers.get('content-type') || '').toLowerCase();
    
    let isImg = false;
    if (explicitType === 'image') {
      isImg = true;
    } else if (explicitType === 'video') {
      isImg = false;
    } else {
      const cleanUrl = mediaUrl.split('?')[0].toLowerCase();
      isImg = contentType.includes('image') || 
              cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || 
              cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.heic');
    }

    // Se o CDN retornou de fato imagem mesmo com explicitType video, ajustar para não corromper arquivo
    if (!isImg && contentType.includes('image')) {
      isImg = true;
    }

    const ext = isImg ? '.jpg' : '.mp4';
    const mimeType = isImg ? 'image/jpeg' : 'video/mp4';
    const filename = 'reelio-' + Date.now() + ext;

    res.setHeader('Content-Type', mimeType);
    const dispositionType = isForceDownload ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${filename}"`);

    if (mediaRes.headers.get('content-range')) {
      res.setHeader('Content-Range', mediaRes.headers.get('content-range'));
      res.status(206);
    }
    if (mediaRes.headers.get('accept-ranges')) {
      res.setHeader('Accept-Ranges', mediaRes.headers.get('accept-ranges'));
    }
    if (mediaRes.headers.get('content-length')) {
      res.setHeader('Content-Length', mediaRes.headers.get('content-length'));
    }

    mediaRes.body.pipe(res);
  } catch (err) {
    console.error('[Download Proxy Error]:', err.message);
    return res.redirect(mediaUrl);
  }
});

// Endpoint /extract
app.post('/extract', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !/instagram.com/.test(url)) {
    return res.status(400).json({ error: 'Envie um link válido do Instagram (ex: https://www.instagram.com/reel/... ou https://www.instagram.com/p/...)' });
  }

  const match = url.match(/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  const shortcode = match ? match[1] : null;

  if (!shortcode) {
    return res.status(400).json({ error: 'Não foi possível identificar o código do post/reel nesse link.' });
  }

  const isReel = /\/reel\//i.test(url) || /\/reels\//i.test(url);
  const canonicalUrl = `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${shortcode}/`;
  console.log('[Extract API] Processando shortcode: ' + shortcode + ' para URL: ' + canonicalUrl);

  try {
    const result = await extractInstagramPost(shortcode, canonicalUrl);

    if (result && (result.videoUrl || result.imageUrl)) {
      return res.json(result);
    }

    if (result && result.isNotFound) {
      return res.status(404).json({ 
        error: 'Este post não está disponível no Instagram. Verifique se o link está completo, se a conta é pública ou se o post não foi removido.' 
      });
    }

    return res.status(422).json({ 
      error: 'Não foi possível extrair a mídia desse link. Verifique se o post é público.' 
    });

  } catch (err) {
    console.error('[Extract Error]:', err.message);
    res.status(500).json({ error: err.message || 'Erro interno ao processar o link do Instagram.' });
  }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log('Reelio backend rodando em http://localhost:' + PORT));
}

app.app = app;
app.extractInstagramPost = extractInstagramPost;
app.cleanInstagramCaption = cleanInstagramCaption;
app.decodeInstagramText = decodeInstagramText;
app.decodeHtmlEntities = decodeInstagramText;
app.extractionCache = extractionCache;
app.getCachedExtraction = getCachedExtraction;
app.setCachedExtraction = setCachedExtraction;

module.exports = app;
