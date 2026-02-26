// routes/movies.js
const express = require('express');
const router = express.Router();
const Movie = require('../models/Movie');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// 🔍 BÚSQUEDA
router.get('/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const movies = await Movie.find({
      status: 'active',
      $or: [{ title: { $regex: q, $options: 'i' } }, { category: { $regex: q, $options: 'i' } }],
    }).limit(30);
    res.json({ success: true, data: movies });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 🗑️ BORRAR TODAS LAS PELÍCULAS (endpoint específico - va ANTES de /:id)
router.delete('/delete-all', async (req, res) => {
  try {
    const { confirm, all } = req.query;
    
    // 🔐 Seguridad: requerir confirmación explícita
    if (confirm !== 'true') {
      return res.status(400).json({ 
        success: false, 
        message: 'Requiere ?confirm=true para ejecutar el borrado masivo' 
      });
    }
    
    // Si all=true borra TODO, si no, solo las activas (más seguro)
    const filter = all === 'true' ? {} : { status: 'active' };
    const result = await Movie.deleteMany(filter);
    
    console.log(`🗑️ Eliminadas ${result.deletedCount} películas`);
    
    res.json({ 
      success: true, 
      message: `Se eliminaron ${result.deletedCount} películas`,
      deletedCount: result.deletedCount 
    });
  } catch (err) {
    console.error('❌ Error en DELETE /delete-all movies:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 📋 LISTAR TODAS
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, all } = req.query;
    const filter = all ? {} : { status: 'active' };
    if (category) filter.category = category;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [movies, total] = await Promise.all([
      Movie.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(+limit),
      Movie.countDocuments(filter),
    ]);
    res.json({ success: true, data: movies, pagination: { page: +page, limit: +limit, total } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 🔎 GET BY ID (va AL FINAL para no interferir con rutas específicas)
router.get('/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'Película no encontrada' });
    res.json({ success: true, data: movie });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ➕ CREAR
router.post('/', async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, data: movie, message: 'Película creada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ✏️ ACTUALIZAR
router.put('/:id', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!movie) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: movie, message: 'Película actualizada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// 🔄 CAMBIAR STATUS
router.patch('/:id/status', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, data: movie });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ❌ BORRAR UNA (va al final)
router.delete('/:id', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, message: `"${movie.title}" eliminada` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
