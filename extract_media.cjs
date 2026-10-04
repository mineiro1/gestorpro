const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const posts = [
  { id: 'C6JbWcAuWQE', file: 'rs-media-1', title: 'Limpeza de Capa Térmica' },
  { id: 'C1Nv81lJIYP', file: 'rs-media-2', title: 'Piscina com Cascata & Hidro' },
  { id: 'Cz-HAb-IYAt', file: 'rs-media-3', title: 'Piscina de Fibra com Deck' },
  { id: 'CxvGX_9OGar', file: 'rs-media-4', title: 'Higienização de Capa' },
  { id: 'CxeD4xYpzUu', file: 'rs-media-5', title: 'Correção Química & Parâmetros' },
  { id: 'CjwEmsbuQ2f', file: 'rs-media-6', title: 'Limpeza Fina & Decantação' },
  { id: 'C6FO-xgJDe6', file: 'rs-media-7', title: 'Manutenção da Casa de Máquinas' }
];

function fetchHtml(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

async function run() {
  for (const p of posts) {
    console.log(`\n--- Fetching post: ${p.id} (${p.title}) ---`);
    const html = await fetchHtml(`https://www.instagram.com/p/${p.id}/embed/`);
    
    // Clean string replacements
    let clean = html.split('\\/').join('/');
    clean = clean.split('\\u0026').join('&');
    clean = clean.split('\\u00253D').join('=');
    clean = clean.split('\\u0025').join('%');
    clean = clean.split('&amp;').join('&');

    const mp4Matches = clean.match(/https:\/\/[^"'\\<>\s]+?\.mp4[^"'\\<>\s]*/g) || [];
    const jpgMatches = clean.match(/https:\/\/[^"'\\<>\s]+?\.jpg[^"'\\<>\s]*/g) || [];

    console.log(`Found ${mp4Matches.length} MP4s and ${jpgMatches.length} JPGs`);

    let downloadedVideo = false;
    if (mp4Matches.length > 0) {
      const bestVideoUrl = mp4Matches[0];
      console.log(`Downloading video for ${p.file}...`);
      try {
        execSync(`curl -s -L "${bestVideoUrl}" -o /tmp/${p.file}_raw.mp4`, { maxBuffer: 100 * 1024 * 1024 });
        // Strip audio track with ffmpeg (-an)
        execSync(`ffmpeg -y -i /tmp/${p.file}_raw.mp4 -an -c:v copy public/${p.file}.mp4`, { stdio: 'pipe' });
        console.log(`SUCCESS: public/${p.file}.mp4 created (100% MUTED)`);
        downloadedVideo = true;
      } catch (err) {
        console.error(`Error saving video for ${p.file}:`, err.message);
      }
    }

    if (jpgMatches.length > 0) {
      // Pick the best resolution JPG (avoiding 150x150 avatar)
      const validJpgs = jpgMatches.filter(u => !u.includes('s150x150') && !u.includes('s100x100') && !u.includes('profile_pic'));
      const bestJpgUrl = validJpgs.length > 0 ? validJpgs[0] : jpgMatches[0];
      console.log(`Downloading image for ${p.file}...`);
      try {
        execSync(`curl -s -L "${bestJpgUrl}" -o public/${p.file}.jpg`, { maxBuffer: 100 * 1024 * 1024 });
        console.log(`SUCCESS: public/${p.file}.jpg created`);
      } catch (err) {
        console.error(`Error saving image for ${p.file}:`, err.message);
      }
    }
  }

  console.log('\nALL MEDIA PROCESSED!');
}

run();
