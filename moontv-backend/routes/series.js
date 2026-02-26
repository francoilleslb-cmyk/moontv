// routes/series.js
const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const series = await Series.find({
      status: 'active',
      $or: [{ title: { $regex: q, $options: 'i' } }, { category: { $regex: q, $options: 'i' } }],
    }).limit(30);
    res.json({ success: true, data: series });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
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
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const s = await Series.findById(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Serie no encontrada' });
    res.json({ success: true, data: s });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const s = await Series.create(req.body);
    res.status(201).json({ success: true, data: s, message: 'Serie creada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const s = await Series.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!s) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: s, message: 'Serie actualizada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const s = await Series.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, data: s });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// 🗑️ BORRAR TODAS LAS SERIES (solo admin)
router.delete('/delete-all', async (req, res) => {
  try {
    // Opción 1: Borrar SOLO las activas (más seguro)
    // const result = await Series.deleteMany({ status: 'active' });
    
    // Opción 2: Borrar ABSOLUTAMENTE TODO (¡cuidado!)
    const result = await Series.deleteMany({});
    
    res.json({ 
      success: true, 
      message: `Se eliminaron ${result.deletedCount} series`,
      deletedCount: result.deletedCount 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
module.exports = router;
