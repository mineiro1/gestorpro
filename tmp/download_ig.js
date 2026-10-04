const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const posts = [
  { id: 'C6JbWcAuWQE', file: 'rs-media-1', title: 'Limpeza de Capa Térmica', category: 'videos' },
  { id: 'C1Nv81lJIYP', file: 'rs-media-2', title: 'Piscina com Cascata & Hidro', category: 'fotos' },
  { id: 'Cz-HAb-IYAt', file: 'rs-media-3', title: 'Piscina de Fibra com Deck', category: 'videos' },
  { id: 'CxvGX_9OGar', file: 'rs-media-4', title: 'Higienização de Capa', category: 'fotos' },
  { id: 'CxeD4xYpzUu', file: 'rs-media-5', title: 'Correção Química & Parâmetros', category: 'fotos' },
  { id: 'CjwEmsbuQ2f', file: 'rs-media-6', title: 'Limpeza Fina & Decantação', category: 'fotos' },
  { id: 'C6FO-xgJDe6', file: 'rs-media-7', title: 'Manutenção da Casa de Máquinas', category: 'videos' }
];

function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (err) => {
      console.error('Fetch error:', err.message);
      resolve('');
    });
  });
}

function cleanEscapedUrl(str) {
  return str
    .replace(/\\u0026/g, '&')
    .replace(/\\u00253D/g, '=')
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/');
}

async function run() {
  for (const p of posts) {
    console.log('Processing post:', p.id, p.title);
    const html = await fetchUrl('https://www.instagram.com/p/' + p.id + '/embed/');

    // Find video url
    let videoUrl = null;
    const vMatch = html.match(/"video_url":"([^"]+)"/);
    if (vMatch) {
      videoUrl = cleanEscapedUrl(vMatch[1]);
    }

    // Find display/thumbnail image url
    let imgUrl = null;
    const imgMatch = html.match(/"display_url":"([^"]+)"/) || html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/);
    if (imgMatch) {
      imgUrl = cleanEscapedUrl(imgMatch[1]);
    }

    console.log(`[${p.id}] Video: ${!!videoUrl} | Img: ${!!imgUrl}`);

    if (videoUrl) {
      try {
        console.log(`Downloading video for ${p.file}...`);
        execSync(`curl -s -L "${videoUrl}" -o /tmp/${p.file}_raw.mp4`, { maxBuffer: 100 * 1024 * 1024 });
        // Strip audio with ffmpeg (-an removes audio track completely)
        execSync(`ffmpeg -y -i /tmp/${p.file}_raw.mp4 -an -c:v copy public/${p.file}.mp4`, { stdio: 'pipe' });
        console.log(`SUCCESS: Saved MUTED video to public/${p.file}.mp4`);
      } catch (err) {
        console.error(`Error saving video for ${p.file}:`, err.message);
      }
    }

    if (imgUrl) {
      try {
        console.log(`Downloading image for ${p.file}...`);
        execSync(`curl -s -L "${imgUrl}" -o public/${p.file}.jpg`, { maxBuffer: 100 * 1024 * 1024 });
        console.log(`SUCCESS: Saved image to public/${p.file}.jpg`);
      } catch (err) {
        console.error(`Error saving image for ${p.file}:`, err.message);
      }
    }
  }

  console.log('ALL POSTS PROCESSED SUCCESSFULLY!');
}

run();
