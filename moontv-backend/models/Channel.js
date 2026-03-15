const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const mongoose = require('mongoose');
const Channel = require('./models/Channel'); // ← tu modelo real

const M3U_FOLDER     = './m3u';
const MONGO_URI      = process.env.MONGO_URI || 'mongodb://localhost:27017/moontv';
const TEST_TIMEOUT_MS = 6000;

// ─── PARSER ───────────────────────────────────────────────
function parseM3UFile(filePath) {
  const lines    = fs.readFileSync(filePath, 'utf-8').split('\n').map(l => l.trim());
  const channels = [];
  let drm  = {};
  let meta = {};

  for (const line of lines) {
    if (!line) continue;

    // KODIPROP (con o sin # al inicio)
    const raw  = line.startsWith('#') ? line.slice(1) : line;
    const kodi = raw.match(/^KODIPROP:inputstream\.adaptive\.(\w+)=(.+)/);
    if (kodi) {
      if (kodi[1] === 'license_type') drm.licenseType = kodi[2].trim();
      if (kodi[1] === 'license_key')  drm.licenseKey  = kodi[2].trim();
      continue;
    }

    // EXTINF
    if (line.startsWith('#EXTINF')) {
      meta = {};
      meta.name     = (line.match(/,(.+)$/)              || [])[1]?.trim() || 'Sin nombre';
      meta.logo     = (line.match(/tvg-logo="([^"]+)"/)  || [])[1]?.trim() || '';
      meta.category = (line.match(/group-title="([^"]+)"/) || [])[1]?.trim() || 'General';
      meta.sortOrder = parseInt((line.match(/ch-number="(\d+)"/) || [])[1] || '0');
      continue;
    }

    // URL
    if (line.startsWith('http')) {
      const isDash = line.includes('.mpd');
      channels.push({
        name:      meta.name      || 'Sin nombre',
        logo:      meta.logo      || '',
        category:  meta.category  || 'General',
        sortOrder: meta.sortOrder || 0,
        server: {
          label:     'HD',
          url:       line,
          type:      isDash ? 'dash' : 'hls',
          isWorking: true,
          drm: Object.keys(drm).length ? { ...drm } : undefined,
        },
      });
      drm  = {};
      meta = {};
    }
  }
  return channels;
}

// ─── TESTER ───────────────────────────────────────────────
function testStream(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method: 'HEAD', timeout: TEST_TIMEOUT_MS }, (res) => {
      resolve({ ok: res.statusCode < 400, status: res.statusCode });
    });
    req.on('error',   () => resolve({ ok: false, status: 'error' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 'timeout' }); });
    req.end();
  });
}

// ─── MAIN ─────────────────────────────────────────────────
async function main() {
  const files = fs.readdirSync(M3U_FOLDER).filter(f => f.match(/\.m3u8?$/));
  console.log(`📂 Archivos: ${files.length}`);

  let all = [];
  for (const file of files) {
    const parsed = parseM3UFile(path.join(M3U_FOLDER, file));
    console.log(`  ✅ ${file} → ${parsed.length} canales`);
    all = all.concat(parsed);
  }

  // Deduplicar por URL
  const seen = new Set();
  all = all.filter(c => {
    if (seen.has(c.server.url)) return false;
    seen.add(c.server.url);
    return true;
  });
  console.log(`📺 Total sin duplicados: ${all.length}`);

  // Testear en lotes de 10
  console.log('\n🧪 Testeando streams...');
  const working = [];
  for (let i = 0; i < all.length; i += 10) {
    const batch   = all.slice(i, i + 10);
    const results = await Promise.all(batch.map(c => testStream(c.server.url)));
    results.forEach((res, idx) => {
      const ch   = batch[idx];
      const icon = res.ok ? '🟢' : '🔴';
      console.log(`  ${icon} [${res.status}] ${ch.name}`);
      if (res.ok) working.push(ch);
    });
  }
  console.log(`\n✅ Funcionando: ${working.length} / ${all.length}`);

  fs.writeFileSync('./mdp-report.json', JSON.stringify({ 
    total: all.length, working: working.length, channels: working 
  }, null, 2));

  // Importar a MongoDB
  await mongoose.connect(MONGO_URI);
  console.log('\n💾 Importando...');

  let imported = 0, updated = 0, skipped = 0;

  for (const ch of working) {
    const existing = await Channel.findOne({ name: ch.name });

    if (existing) {
      // Si ya existe el canal, agregar el server DASH si no lo tiene
      const alreadyHasUrl = existing.servers.some(s => s.url === ch.server.url);
      if (!alreadyHasUrl) {
        existing.servers.push(ch.server);
        // Si no tiene streamUrl, asignarlo
        if (!existing.streamUrl) existing.streamUrl = ch.server.url;
        await existing.save();
        updated++;
        console.log(`  🔄 Actualizado: ${ch.name}`);
      } else {
        skipped++;
      }
    } else {
      // Canal nuevo
      await Channel.create({
        name:      ch.name,
        logo:      ch.logo,
        category:  ch.category,
        sortOrder: ch.sortOrder,
        streamUrl: ch.server.url,
        servers:   [ch.server],
        status:    'active',
        country:   'AR',
        language:  'es',
      });
      imported++;
    }
  }

  console.log(`\n🏁 Importados: ${imported} | Actualizados: ${updated} | Skipped: ${skipped}`);
  await mongoose.disconnect();
}

main().catch(console.error);
