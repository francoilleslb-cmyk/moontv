// routes/channels.js
const express  = require('express');
const router   = express.Router();
const Channel  = require('../models/Channel');
const User     = require('../models/User');
const { protect, adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// ── GET /api/channels/stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [total, active, inactive, byCategory] = await Promise.all([
      Channel.countDocuments(),
      Channel.countDocuments({ status: 'active' }),
      Channel.countDocuments({ status: 'inactive' }),
      Channel.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);
    res.json({ success: true, data: { total, active, inactive, byCategory } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/channels/categories ────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const cats = await Channel.distinct('category', { status: 'active' });
    res.json({ success: true, data: cats.sort() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/channels/search?q= ─────────────────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const channels = await Channel.find({
      status: 'active',
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
      ],
    }).limit(30).sort({ sortOrder: 1 });
    res.json({ success: true, data: channels });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/channels ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, country, q, page = 1, limit = 100, all } = req.query;
    const filter = {};

    if (!all) { filter.status = 'active'; filter.isAdult = false; }
    if (category) filter.category = category;
    if (country)  filter.country  = country.toUpperCase();
    if (q) filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } },
    ];

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [channels, total] = await Promise.all([
      Channel.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Channel.countDocuments(filter),
    ]);

    res.json({ success: true, data: channels, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / +limit) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/channels/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const channel = await Channel.findOne(
      isObjectId ? { _id: req.params.id } : { slug: req.params.id }
    );
    if (!channel) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    res.json({ success: true, data: channel });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/channels/:id/favorite  (usuario autenticado) ──────────────────
router.post('/:id/favorite', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const idx  = user.favorites.indexOf(req.params.id);
    if (idx >= 0) user.favorites.splice(idx, 1);
    else          user.favorites.push(req.params.id);
    await user.save();
    res.json({ success: true, data: { favorites: user.favorites }, isFavorite: idx < 0 });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/channels/:id/view ──────────────────────────────────────────────
router.post('/:id/view', async (req, res) => {
  try {
    await Channel.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/channels  (admin) ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const channel = await Channel.create(req.body);
    res.status(201).json({ success: true, data: channel, message: 'Canal creado' });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Ya existe un canal con ese nombre' });
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── PUT /api/channels/:id  (admin) ───────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const ch = await Channel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!ch) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    res.json({ success: true, data: ch, message: 'Canal actualizado' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ── PATCH /api/channels/:id/status  (admin) ──────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const ch = await Channel.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!ch) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    res.json({ success: true, data: ch, message: `Canal ${status === 'active' ? 'activado' : 'desactivado'}` });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ── POST /api/channels/test-stream  (admin) ─────────────────────────────────
router.post('/test-stream', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'URL requerida' });

  const lib = url.startsWith('https') ? require('https') : require('http');
  const result = await new Promise(resolve => {
    const request = lib.request(url, { method: 'HEAD', timeout: 6000 }, r => {
      resolve({ working: r.statusCode < 400, statusCode: r.statusCode });
    });
    request.on('error',   (e) => resolve({ working: false, statusCode: 0, error: e.message }));
    request.on('timeout', ()  => { request.destroy(); resolve({ working: false, statusCode: 0, error: 'timeout' }); });
    request.end();
  });

  res.json({ success: true, data: result });
});

// ── DELETE /api/channels/:id  (admin) ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const ch = await Channel.findByIdAndDelete(req.params.id);
    if (!ch) return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    res.json({ success: true, message: `Canal "${ch.name}" eliminado` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/channels/import  (admin) ──────────────────────────────────────
router.post('/import', async (req, res) => {
  try {
    const { channels, m3uContent } = req.body;
    const toImport = m3uContent ? parseM3U(m3uContent) : channels;
    if (!Array.isArray(toImport)) return res.status(400).json({ success: false, message: 'Formato inválido' });

    let created = 0, updated = 0, errors = 0;
    for (const ch of toImport) {
      try {
        const exists = await Channel.findOne({ name: ch.name });
        if (exists) {
          // Actualizar key DRM si cambió
          const newKey  = ch.servers?.[0]?.drm?.licenseKey;
          const currKey = exists.servers?.find(s => s.url === ch.streamUrl)?.drm?.licenseKey;
          if (newKey && newKey !== currKey) {
            const srvIdx = exists.servers.findIndex(s => s.url === ch.streamUrl);
            if (srvIdx >= 0) exists.servers[srvIdx].drm = ch.servers[0].drm;
            else             exists.servers.push(ch.servers[0]);
            exists.markModified('servers');
            await exists.save();
          } else {
            await Channel.findByIdAndUpdate(exists._id, ch);
          }
          updated++;
        } else {
          await Channel.create(ch);
          created++;
        }
      } catch { errors++; }
    }
    res.json({ success: true, data: { created, updated, errors }, message: `${created} nuevos, ${updated} actualizados, ${errors} errores` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── DELETE /api/channels  (admin) — borrar múltiples ────────────────────────
router.delete('/', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ success: false, message: 'ids requerido' });
    const result = await Channel.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: `${result.deletedCount} canales eliminados` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── CATEGORÍA POR NOMBRE DE CANAL ───────────────────────────────────────────
function guessCategory(name) {
  const n = name.toLowerCase();
  if (/espn|fox sport|dsport|directv sport|tyc|ole|flow sport|deportes|nacion deportiva|canal\+\s*\d|sport\s*\d/i.test(n))         return 'Deportes';
  if (/tn\b|c5n|infobae|a24|cnn|bbc|euronews|cronica|ip\s*noticias|noticias|news|telam/i.test(n))                                   return 'Noticias';
  if (/disney|cartoon|nickelodeon|baby tv|paka|discovery kids|nik\b|pequeños|infantil|mini/i.test(n))                               return 'Infantil';
  if (/hbo|cinemax|paramount|star\b|space\b|tnt\b|universal|cine\b|cineco|multiplex|mov\b|golden|odeon/i.test(n))                   return 'Películas';
  if (/nat geo|discovery|history|animal planet|science|odisea|documental|encuentro|paka paka/i.test(n))                             return 'Documentales';
  if (/mtv\b|vh1|flow music|hit\b|musica|rock|pop\b|clásica|cadena|mega\s*music/i.test(n))                                         return 'Música';
  if (/netflix|hbo\s*series|star\+|ax\b|tbs\b|series|fox\b|sony\b|much\b|id\b|e!\b|bravo/i.test(n))                               return 'Series';
  if (/america\b|telefe|trece|canal\s*9|el\s*nueve|publica|canal\s*26|tv\s*publica|elnueve|once\s*tv|mega\b/i.test(n))             return 'Entretenimiento';
  if (/regional|litoral|cordillera|patagonia|local|ciudad|cordoba|rosario|mendoza|tucuman/i.test(n))                               return 'Regional';
  if (/comedy|humor|syfy|fx\b|axn\b|warner\b/i.test(n))                                                                            return 'Entretenimiento';
  return 'General';
}

// ─── PARSE M3U con soporte KODIPROP (DRM ClearKey) ───────────────────────────
function parseM3U(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const out   = [];
  let cur = null;
  let drm = {};

  for (const line of lines) {
    // Capturar KODIPROP (con o sin # al inicio)
    const raw  = line.startsWith('#') ? line.slice(1) : line;
    const kodi = raw.match(/^KODIPROP:inputstream\.adaptive\.(\w+)=(.+)/);
    if (kodi) {
      if (kodi[1] === 'license_type') drm.licenseType = kodi[2].trim();
      if (kodi[1] === 'license_key')  drm.licenseKey  = kodi[2].trim();
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.+)$/);
      const tvgName   = line.match(/tvg-name="([^"]+)"/);
      const name      = nameMatch?.[1]?.trim() || tvgName?.[1] || 'Canal';

      // Si el group-title parece nombre de proveedor, ignorarlo y adivinar por nombre
      const rawCategory  = line.match(/group-title="([^"]+)"/) ?.[1] || '';
      const isProvider   = /flow|opcion|opción|pack|lista|option|proveedor|hd\s*\d|sd\s*\d|vod|iptv/i.test(rawCategory);
      const category     = isProvider ? guessCategory(name) : (rawCategory || guessCategory(name));

      cur = {
        name,
        logo:      line.match(/tvg-logo="([^"]+)"/)    ?.[1] || '',
        category,
        sortOrder: parseInt(line.match(/ch-number="(\d+)"/) ?.[1] || '0'),
        country:   'AR',
        status:    'active',
      };
    } else if (cur && !line.startsWith('#') && line.startsWith('http')) {
      const isDash = line.includes('.mpd');
      const server = { url: line, label: 'HD', type: isDash ? 'dash' : 'hls' };
      if (Object.keys(drm).length) server.drm = { ...drm };
      cur.streamUrl = line;
      cur.servers   = [server];
      out.push(cur);
      cur = null;
      drm = {};
    }
  }
  return out;
}

module.exports = router;
