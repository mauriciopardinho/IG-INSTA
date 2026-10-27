const fetch = require('node-fetch');

const links = [
  { name: 'Link 1', url: 'https://www.instagram.com/p/De-Tehfx2tr/?utm_source=ig_web_copy_link&xtok=NTc4MTIwNjQ2YQ==' },
  { name: 'Link 2', url: 'https://www.instagram.com/p/De-C6pts5VH/?utm_source=ig_web_copy_link&exln=NTc4MTIwNjQ2YQ==' },
  { name: 'Link 3', url: 'https://www.instagram.com/p/De9zPROh9ZS/?utm_source=ig_web_copy_link&vrfl=NTc4MTIwNjQ2YQ==' },
  { name: 'Link 4', url: 'https://www.instagram.com/reel/De-ZySjtIx2/?utm_source=ig_web_copy_link&psln=NTc4MTIwNjQ2YQ==' }
];

(async () => {
  for (const item of links) {
    const match = item.url.match(/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    const shortcode = match[1];
    console.log(`\n======================================================`);
    console.log(`Analyzing ${item.name} - Shortcode: ${shortcode}`);
    console.log(`======================================================`);

    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const res = await fetch(embedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    console.log('HTTP Status:', res.status);
    const html = await res.text();
    console.log('HTML Length:', html.length);

    const vidMatch = html.match(/video_url[\\]*":[\\]*"(https?:[^"\\]+)/i) ||
                     html.match(/video_url[\\]*":[\\]*"([^"]+)/i);
    const imgMatch = html.match(/"display_url"\s*:\s*"([^"]+)"/i) ||
                     html.match(/display_url[\\]*":[\\]*"(https?:[^"\\]+)/i) ||
                     html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i);

    console.log('Has video_url:', !!vidMatch);
    if (vidMatch) {
      console.log('video_url preview:', vidMatch[1].slice(0, 80));
    }

    console.log('Has display_url:', !!imgMatch);
    if (imgMatch) {
      console.log('img_url preview:', imgMatch[1].slice(0, 80));
    }

    const captionBlockMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
    if (captionBlockMatch) {
      let cap = captionBlockMatch[1]
        .replace(/<a class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/gi, '')
        .replace(/<[^>]*class="[^"]*(?:CaptionComments|CaptionTime|CaptionMeta|CaptionMore)[^"]*"[^>]*>[\s\S]*?<\/[a-z0-9]+>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/View (?:all )?[\d,.]+ comments/gi, '')
        .replace(/Ver todos os [\d,.]+ coment[áa]rios/gi, '')
        .trim();
      console.log('Caption preview:', cap.slice(0, 100));
    } else {
      console.log('No caption block');
    }
  }
  process.exit(0);
})();
