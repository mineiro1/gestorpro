const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');

const posts = [
  { id: 'C6JbWcAuWQE', name: 'post-1-capa', title: 'Limpeza de Capa Térmica' },
  { id: 'C1Nv81lJIYP', name: 'post-2-cascata', title: 'Piscina com Cascata & Hidro' },
  { id: 'Cz-HAb-IYAt', name: 'post-3-deck', title: 'Piscina de Fibra com Deck' },
  { id: 'CxvGX_9OGar', name: 'post-4-higienizacao', title: 'Higienização de Capa Térmica' },
  { id: 'CxeD4xYpzUu', name: 'post-5-quimica', title: 'Correção Química & Saúde' },
  { id: 'CjwEmsbuQ2f', name: 'post-6-decantacao', title: 'Limpeza Fina & Decantação' },
  { id: 'C6FO-xgJDe6', name: 'post-7-maquinas', title: 'Manutenção da Casa de Máquinas' }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function cleanUrl(str) {
  return str.split('\\/').join('/').split('\\u0026').join('&').split('&amp;').join('&');
}

async function run() {
  for (const p of posts) {
    console.log(`\n=== Processing: ${p.id} (${p.name}) ===`);
    try {
      const rawHtml = execSync(`curl -s -L "https://www.instagram.com/p/${p.id}/embed/"`, { maxBuffer: 50 * 1024 * 1024 }).toString();
      
      // 1. Extract Video URL if present
      const vIdx = rawHtml.indexOf('video_url');
      if (vIdx !== -1) {
        const sub = rawHtml.substring(vIdx);
        const match = sub.match(/video_url\\":\\"([^\\"]+)/);
        if (match) {
          const vUrl = cleanUrl(match[1]);
          console.log('Downloading video URL...');
          await downloadFile(vUrl, `/tmp/${p.name}_raw.mp4`);
          // Strip audio completely with ffmpeg (-an)
          execSync(`ffmpeg -y -i /tmp/${p.name}_raw.mp4 -an -c:v copy public/${p.name}.mp4`, { stdio: 'pipe' });
          console.log(`SUCCESS: public/${p.name}.mp4 created!`);
        }
      }

      // 2. Extract Display Image URL
      const dIdx = rawHtml.indexOf('display_url');
      if (dIdx !== -1) {
        const sub = rawHtml.substring(dIdx);
        const match = sub.match(/display_url\\":\\"([^\\"]+)/);
        if (match) {
          const iUrl = cleanUrl(match[1]);
          console.log('Downloading display image URL...');
          await downloadFile(iUrl, `public/${p.name}.jpg`);
          console.log(`SUCCESS: public/${p.name}.jpg created!`);
        }
      }

    } catch (err) {
      console.error(`Error for ${p.id}:`, err.message);
    }
  }

  console.log('\n=== ALL MEDIA PROCESSED! ===');
}

run();
