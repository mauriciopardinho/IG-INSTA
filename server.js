// server.js - Backend definitivo do Reelio (Suporte 100% Robusto a Reels, Vídeos e Imagens)
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { instagramGetUrl } = require('instagram-url-direct');
const btch = require('btch-downloader');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

// Impedir que navegadores guardem o HTML ou requisições no cachê local
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(__dirname));

let browserPromise = null;

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
    } catch(e) {}
  }

  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) return p;
  }

  try {
    const pptr = require('puppeteer');
    if (pptr.executablePath && fs.existsSync(pptr.executablePath())) {
      return pptr.executablePath();
    }
  } catch(e) {}

  return null;
}

async function getBrowser() {
  if (!browserPromise) {
    let launchOptions = {
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

    browserPromise = puppeteer.launch(launchOptions);
  }
  return browserPromise;
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Proxy endpoint para permitir download e visualização direta sem erro de CORS
app.get('/download', async (req, res) => {
  const mediaUrl = req.query.url;
  const isForceDownload = req.query.dl === '1';
  const explicitType = req.query.type; // 'image' ou 'video'
  if (!mediaUrl) return res.status(400).send('URL de mídia ausente.');

  try {
    const mediaRes = await fetch(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });

    if (!mediaRes.ok) {
      console.log('[Download Proxy] CDN não deu 200 no IP do servidor. Redirecionando cliente direto para a CDN...');
      return res.redirect(mediaUrl);
    }

    const contentType = (mediaRes.headers.get('content-type') || '').toLowerCase();
    
    // Determinar rigorosamente se é imagem ou vídeo
    let isImg = false;
    if (explicitType === 'image') {
      isImg = true;
    } else if (explicitType === 'video') {
      isImg = false;
    } else {
      const cleanUrl = mediaUrl.split('?')[0].toLowerCase();
      isImg = contentType.includes('image') || 
              cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || 
              cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.heic') ||
              (mediaUrl.includes('filename=') && !mediaUrl.includes('.mp4'));
    }

    const ext = isImg ? '.jpg' : '.mp4';
    const mimeType = isImg ? 'image/jpeg' : 'video/mp4';
    const filename = 'reelio-' + Date.now() + ext;

    res.setHeader('Content-Type', mimeType);
    const dispositionType = isForceDownload ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${filename}"`);
    
    mediaRes.body.pipe(res);
  } catch (err) {
    console.error('[Download Proxy Error]:', err.message);
    return res.redirect(mediaUrl);
  }
});

app.post('/extract', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !/instagram.com/.test(url)) {
    return res.status(400).json({ error: 'Envie um link válido do Instagram (ex: https://www.instagram.com/reel/... ou https://www.instagram.com/p/...)' });
  }

  const match = url.match(/(?:reel|p|reels)\/([A-Za-z0-9_-]+)/);
  const shortcode = match ? match[1] : null;

  if (!shortcode) {
    return res.status(400).json({ error: 'Não foi possível identificar o código do post/reel nesse link.' });
  }

  console.log('[Extract] Processando shortcode: ' + shortcode + ' para URL: ' + url);

  try {
    const result = await extractInstagramPost(shortcode, url);

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

function cleanInstagramCaption(rawDesc) {
  if (!rawDesc) return '';
  let caption = rawDesc;

  const quoteMatch = caption.match(/:\s*["“](.*?)["”]\s*\.?$/s) || caption.match(/:\s*["“](.*)/s);
  if (quoteMatch && quoteMatch[1] && quoteMatch[1].trim() !== '') {
    caption = quoteMatch[1].replace(/["”]\s*\.?$/, '').trim();
  } else {
    caption = caption.replace(/^[\d\s\w,]+-\s*[\w._]+\s+no\s+[^:]+:\s*/i, '');
  }

  return decodeHtmlEntities(caption);
}

async function extractOpenGraph(url, shortcode) {
  try {
    console.log('[OpenGraph] Extraindo via Crawler:', url);
    const isReelLink = /\/reel\//i.test(url) || /\/reels\//i.test(url);
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

    const ogImgMatch = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);

    const mp4Regex = new RegExp('https?:\\?/\\?/[^"\'\\s<>]+\\.mp4[^"\'\\s<>]*', 'gi');
    const mp4Matches = html.match(mp4Regex) || [];
    const validMp4s = mp4Matches.map(m => m.replace(/\\/g, '').replace(/&bytestart=\d+/g, '').replace(/&byteend=\d+/g, ''))
                                .filter(u => u.includes('cdninstagram') || u.includes('fbcdn'));

    const ogDescMatch = html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/content=["']([^"']+)["']\s+property=["']og:description["']/i) ||
                        html.match(/name=["']description["']\s+content=["']([^"']+)["']/i);

    let caption = ogDescMatch ? cleanInstagramCaption(ogDescMatch[1]) : '';

    // Apenas considerar vídeo se for link de /reel/ ou se og:video estiver explicitamente presente no HTML
    const isVideoPost = !!ogVidMatch || isReelLink;
    let videoUrl = isVideoPost ? (ogVidMatch ? decodeHtmlEntities(ogVidMatch[1]) : (validMp4s.length > 0 ? validMp4s[0] : null)) : null;
    let imageUrl = !videoUrl ? (ogImgMatch ? decodeHtmlEntities(ogImgMatch[1]) : null) : null;

    return {
      isNotFound: false,
      videoUrl: videoUrl,
      imageUrl: videoUrl ? null : imageUrl,
      isImage: !videoUrl && !!imageUrl,
      caption: caption
    };
  } catch (e) {
    console.error('[OpenGraph Error]:', e.message);
  }
  return null;
}

async function extractEmbedDirect(shortcode) {
  try {
    const embedUrl = 'https://www.instagram.com/p/' + shortcode + '/embed/captioned/';
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();

    let videoUrl = null;
    let imageUrl = null;
    let caption = '';

    const mp4Regex = new RegExp('https?:\\?/\\?/[^"\'\\s<>]+\\.mp4[^"\'\\s<>]*', 'i');
    const mp4Match = html.match(mp4Regex);
    if (mp4Match) {
      videoUrl = mp4Match[0].replace(/\\/g, '').replace(/&bytestart=\d+/g, '').replace(/&byteend=\d+/g, '');
    }

    const embedImgMatch = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i) ||
                          html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                          html.match(/"display_url"\s*:\s*"([^"]+)"/i);

    if (embedImgMatch) {
      imageUrl = decodeHtmlEntities(embedImgMatch[1].replace(/\\/g, ''));
    }

    const captionMatch = html.match(/class="Caption"[^>]*>(.*?)<\/div>/s);
    if (captionMatch) {
      caption = captionMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (videoUrl || imageUrl) {
      console.log('[EmbedExtract] Sucesso via Embed Scraper direto!');
      return {
        isNotFound: false,
        videoUrl: videoUrl,
        imageUrl: videoUrl ? null : imageUrl,
        isImage: !videoUrl && !!imageUrl,
        caption: caption
      };
    }
  } catch (e) {
    console.log('[EmbedExtract] Erro:', e.message);
  }
  return null;
}

async function extractInstagramPost(shortcode, originalUrl) {
  // 1. Tentar btch.igdl (Engine rápida de altíssima precisão para Reels e Posts)
  try {
    console.log('[btch.igdl] Tentando extração via btch.igdl para:', originalUrl);
    const btchRes = await btch.igdl(originalUrl);
    if (btchRes && btchRes.status && Array.isArray(btchRes.result) && btchRes.result.length > 0) {
      const validItems = btchRes.result.filter(item => (item.url && item.url.trim() !== '') || (item.thumbnail && item.thumbnail.trim() !== ''));
      if (validItems.length > 0) {
        const mediaItem = validItems[0];
        const rawMediaUrl = (mediaItem.url && mediaItem.url.trim()) || (mediaItem.thumbnail && mediaItem.thumbnail.trim());
        const isReelLink = /\/reel\//i.test(originalUrl) || /\/reels\//i.test(originalUrl);
        const cleanMediaUrl = rawMediaUrl.toLowerCase().split('?')[0];
        const isVideo = isReelLink || cleanMediaUrl.endsWith('.mp4') || cleanMediaUrl.endsWith('.mov');
        
        console.log(`[btch.igdl SUCCESS] Mídia extraída com sucesso! Tipo: ${isVideo ? 'VÍDEO' : 'IMAGEM'}`);

        let realCaption = "";
        try {
          const ogRes = await extractOpenGraph(originalUrl, shortcode);
          if (ogRes && ogRes.caption) {
            realCaption = ogRes.caption;
          }
        } catch(e) {}

        return {
          isNotFound: false,
          videoUrl: isVideo ? rawMediaUrl : null,
          imageUrl: isVideo ? null : rawMediaUrl,
          isImage: !isVideo,
          caption: realCaption || "Publicação do Instagram"
        };
      } else {
        console.log('[btch.igdl] Retornou array mas sem URLs válidas de mídia. Acionando fallbacks...');
      }
    }
  } catch (err) {
    console.log('[btch.igdl Fallback]:', err.message);
  }

  // 2. Tentar OpenGraph Crawler Inteligente (facebookexternalhit)
  const ogResult = await extractOpenGraph(originalUrl, shortcode);
  if (ogResult && (ogResult.videoUrl || ogResult.imageUrl)) {
    return ogResult;
  }

  // 3. Tentar instagram-url-direct se for vídeo
  try {
    console.log('[FastExtract] Tentando instagram-url-direct para: ' + originalUrl);
    const directData = await instagramGetUrl(originalUrl);
    if (directData && directData.url_list && directData.url_list.length > 0) {
      console.log('[FastExtract] Sucesso com instagram-url-direct!');
      return {
        isNotFound: false,
        videoUrl: directData.url_list[0],
        imageUrl: null,
        isImage: false,
        caption: (directData.results && directData.results.caption) || ''
      };
    }
  } catch (e) {
    console.log('[FastExtract] Fallback:', e.message);
  }

  // 4. Fallback Embed Direct
  const embedResult = await extractEmbedDirect(shortcode);
  if (embedResult && (embedResult.videoUrl || embedResult.imageUrl)) {
    return embedResult;
  }

  // 5. Fallback Puppeteer Stealth
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

    const isReel = /\/reel\//i.test(originalUrl);
    const targetUrl = 'https://www.instagram.com/' + (isReel ? 'reel' : 'p') + '/' + shortcode + '/';
    console.log('[Stealth] Navegando para: ' + targetUrl);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await new Promise(r => setTimeout(r, 4000));

    const pageContent = await page.content();
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
      return { isNotFound: true, videoUrl: null, caption: '' };
    }

    let finalVideoUrl = pageData.videoSrc;
    if (isReel && !finalVideoUrl && mp4Urls.length > 0) {
      finalVideoUrl = mp4Urls[0];
    }

    const isVid = isReel || !!finalVideoUrl;
    const cleanedCaption = cleanCaption(pageData.rawCaption);

    return {
      isNotFound: false,
      videoUrl: isVid ? finalVideoUrl : null,
      imageUrl: isVid ? null : (pageData.imgSrc || null),
      isImage: !isVid,
      caption: cleanedCaption
    };
  } catch (err) {
    console.error('[Stealth Error]:', err.message);
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

function cleanCaption(desc) {
  if (!desc) return '';
  const parts = desc.split(': "');
  if (parts.length > 1) {
    return parts.slice(1).join(': "').replace(/"\.\s*$/, '').replace(/"$/, '').trim();
  }
  return desc.replace(/^"|"$/g, '').trim();
}

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log('Reelio backend rodando em http://localhost:' + PORT));
}

module.exports = app;
