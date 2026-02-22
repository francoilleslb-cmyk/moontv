// routes/channels.js
const express  = require('express');
const router   = express.Router();
const Channel  = require('../models/Channel');
const User     = require('../models/User');
const { protect, adminAuth } = require('../middleware/auth');

router.use(adminAuth); // protege PUT/POST/DELETE con ADMIN_KEY

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
        if (exists) { await Channel.findByIdAndUpdate(exists._id, ch); updated++; }
        else        { await Channel.create(ch); created++; }
      } catch { errors++; }
    }
    res.json({ success: true, data: { created, updated, errors }, message: `${created} nuevos, ${updated} actualizados, ${errors} errores` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

function parseM3U(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const out = []; let cur = null;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      cur = {
        name:     (line.match(/tvg-name="([^"]+)"/) || line.match(/,(.+)$/))?.[1] || 'Canal',
        logo:     line.match(/tvg-logo="([^"]+)"/) ?.[1] || '',
        category: line.match(/group-title="([^"]+)"/)?.[1] || 'General',
        country:  'AR', status: 'active',
      };
    } else if (cur && !line.startsWith('#') && line.startsWith('http')) {
      cur.streamUrl = line;
      cur.servers   = [{ url: line, label: 'HD', type: 'hls' }];
      out.push(cur); cur = null;
    }
  }
  return out;
}

module.exports = router;
