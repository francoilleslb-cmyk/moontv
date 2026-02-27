const express = require('express');
const router = express.Router();
const Movie = require('../models/Movie');
const { adminAuth } = require('../middleware/auth');
const { exec } = require('child_process'); // Necesario para ejecutar yt-dlp

// 🎥 RUTA DE REPRODUCCIÓN (Extractor de Video)
// Esta ruta debe ser pública o tener un middleware diferente si la App no envía token de admin
router.get('/:id/play', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie || !movie.sourceUrl) {
      return res.status(404).json({ success: false, message: 'URL no disponible' });
    }

    console.log(`Extracting video from: ${movie.sourceUrl}`);

    // Ejecutamos yt-dlp (el binario que descargamos en el build)
    // -g: devuelve solo la URL del video
    // --no-warnings: limpia la salida
    exec(`./yt-dlp -g --no-warnings "${movie.sourceUrl}"`, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error extractor:', stderr);
        return res.status(500).json({ 
          success: false, 
          message: 'No se pudo extraer el link de video',
          error: stderr 
        });
      }

      const videoUrl = stdout.trim();
      res.json({ 
        success: true, 
        url: videoUrl,
        title: movie.title 
      });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

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

// 🗑️ BORRAR TODAS LAS PELÍCULAS
router.delete('/delete-all', adminAuth, async (req, res) => {
  try {
    const { confirm, all } = req.query;
    if (confirm !== 'true') {
      return res.status(400).json({ success: false, message: 'Requiere ?confirm=true' });
    }
    const filter = all === 'true' ? {} : { status: 'active' };
    const result = await Movie.deleteMany(filter);
    res.json({ success: true, message: `Se eliminaron ${result.deletedCount} películas` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
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

// 🔎 GET BY ID
router.get('/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'Película no encontrada' });
    res.json({ success: true, data: movie });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ➕ CREAR
router.post('/', adminAuth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, data: movie, message: 'Película creada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ✏️ ACTUALIZAR
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!movie) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: movie, message: 'Película actualizada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// 🔄 CAMBIAR STATUS
router.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, data: movie });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ❌ BORRAR UNA
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, message: `"${movie.title}" eliminada` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
