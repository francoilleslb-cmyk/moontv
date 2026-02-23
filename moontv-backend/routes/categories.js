// routes/categories.js
const express  = require('express');
const router   = express.Router();
const Category = require('../models/Category');
const Channel  = require('../models/Channel');
const { adminAuth } = require('../middleware/auth');
const http     = require('http');
const https    = require('https');

// ── GET /api/categories ──────────────────────────────────────────────────────
// Devuelve categorías del modelo + las que existen en canales (union)
router.get('/', async (req, res) => {
  try {
    const [saved, fromChannels] = await Promise.all([
      Category.find().sort({ sortOrder: 1, name: 1 }),
      Channel.distinct('category'),
    ]);

    // Unir ambas fuentes sin duplicados
    const savedNames = new Set(saved.map(c => c.name));
    const extra = fromChannels
      .filter(n => n && !savedNames.has(n))
      .map(n => ({ name: n, icon: '📺', description: '', _id: null, fromChannels: true }));

    const all = [
      ...saved.map(c => ({ ...c.toObject(), fromChannels: false })),
      ...extra,
    ];

    // Contar canales por categoría
    const counts = await Channel.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]));

    const withCounts = all.map(c => ({
      ...c,
      channelCount: countMap[c.name] || 0,
    }));

    res.json({ success: true, data: withCounts });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/categories ─────────────────────────────────────────────────────
router.post('/', adminAuth, async (req, res) => {
  try {
    const { name, icon = '📺', description = '', sortOrder = 0 } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'El nombre es requerido' });

    const cat = await Category.create({ name: name.trim(), icon, description, sortOrder });
    res.status(201).json({ success: true, data: cat, message: `Categoría "${cat.name}" creada` });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Esa categoría ya existe' });
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── PUT /api/categories/:name ─────────────────────────────────────────────────
router.put('/:name', adminAuth, async (req, res) => {
  try {
    const oldName = decodeURIComponent(req.params.name);
    const { name, icon, description, sortOrder } = req.body;

    // Si cambia el nombre, actualizar todos los canales que la usan
    if (name && name !== oldName) {
      await Channel.updateMany({ category: oldName }, { category: name.trim() });
    }

    const cat = await Category.findOneAndUpdate(
      { name: oldName },
      { name: name?.trim() || oldName, icon, description, sortOrder },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: cat, message: `Categoría actualizada` });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ── DELETE /api/categories/:name ─────────────────────────────────────────────
router.delete('/:name', adminAuth, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    if (name === 'General') return res.status(400).json({ success: false, message: 'No se puede eliminar la categoría General' });

    // Mover todos los canales de esta categoría a "General"
    const moved = await Channel.countDocuments({ category: name });
    await Channel.updateMany({ category: name }, { category: 'General' });

    // Eliminar del modelo si existe
    await Category.findOneAndDelete({ name });

    res.json({
      success: true,
      message: `Categoría "${name}" eliminada. ${moved} canal${moved !== 1 ? 'es' : ''} movido${moved !== 1 ? 's' : ''} a General`,
      movedCount: moved,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/categories/test-stream ────────────────────────────────────────
// Verifica si una URL de stream responde (server-side para evitar CORS)
router.post('/test-stream', adminAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'URL requerida' });

  const timeout = 8000;
  const protocol = url.startsWith('https') ? https : http;

  try {
    const result = await new Promise((resolve) => {
      const req2 = protocol.get(url, { timeout }, (r) => {
        const ok = r.statusCode >= 200 && r.statusCode < 400;
        r.destroy(); // no descargar el stream
        resolve({ ok, status: r.statusCode, contentType: r.headers['content-type'] || '' });
      });
      req2.on('timeout', () => { req2.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
      req2.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
    });

    res.json({
      success: true,
      data: {
        url,
        working: result.ok,
        statusCode: result.status,
        contentType: result.contentType,
        error: result.error || null,
      }
    });
  } catch (err) {
    res.json({ success: true, data: { url, working: false, error: err.message } });
  }
});

module.exports = router;
