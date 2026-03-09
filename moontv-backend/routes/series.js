const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const { adminAuth } = require('../middleware/auth');

router.get('/:id/play', async (req, res) => {
  try {
    const { season, episode } = req.query;
    const serie = await Series.findById(req.params.id);
    if (!serie) return res.status(404).json({ success: false, message: 'Serie no encontrada' });
    const streamUrl = `https://www.cineby.gd/tv/${serie.tmdbId}?season=${season || 1}&episode=${episode || 1}`;
    res.json({ success: true, url: streamUrl, embedType: 'cineby', title: serie.title + ' ' + (season||1) + 'x' + (episode||1) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const series = await Series.find({
      status: 'active',
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } }
      ]
    }).limit(30);
    res.json({ success: true, data: series });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/delete-all', adminAuth, async (req, res) => {
  try {
    const { confirm, all } = req.query;
    if (confirm !== 'true') return res.status(400).json({ success: false, message: 'Requiere ?confirm=true' });
    const result = await Series.deleteMany(all === 'true' ? {} : { status: 'active' });
    res.json({ success: true, message: 'Eliminadas: ' + result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, all } = req.query;
    const filter = all ? {} : { status: 'active' };
    if (category) filter.category = category;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [series, total] = await Promise.all([
      Series.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(+limit),
      Series.countDocuments(filter),
    ]);
    res.json({ success: true, data: series, pagination: { page: +page, limit: +limit, total } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const s = await Series.findById(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Serie no encontrada' });
    res.json({ success: true, data: s });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', adminAuth, async (req, res) => {
  try {
    const s = await Series.create(req.body);
    res.status(201).json({ success: true, data: s, message: 'Serie creada' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:id', adminAuth, async (req, res) => {
  try {
    const s = await Series.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!s) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: s, message: 'Actualizada' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const s = await Series.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, data: s });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const s = await Series.findByIdAndDelete(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, message: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
