const express = require('express');
const router = express.Router();
const Movie = require('../models/Movie');
const { adminAuth } = require('../middleware/auth');
const { exec } = require('child_process');
const axios = require('axios');
const cheerio = require('cheerio');

// 🎥 RUTA DE REPRODUCCIÓN
router.get('/:id/play', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie || !movie.streamUrl) {
      return res.status(404).json({ success: false, message: 'URL no disponible' });
    }

    console.log(`🎬 Extrayendo video de: ${movie.streamUrl}`);

    // Intento 1: yt-dlp
    exec(`./yt-dlp -g --no-warnings "${movie.streamUrl}"`, async (error, stdout, stderr) => {
      if (!error && stdout.trim()) {
        console.log(`✅ yt-dlp extrajo: ${stdout.trim().substring(0, 80)}...`);
        return res.json({ 
          success: true, 
          url: stdout.trim(),
          title: movie.title 
        });
      }

      // Intento 2: cheerio como fallback
      console.warn('⚠️ yt-dlp falló, intentando con cheerio...');
      try {
        const { data } = await axios.get(movie.streamUrl, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
          },
          timeout: 10000
        });
        const $ = cheerio.load(data);

        let videoUrl = $('iframe[src*="player"], iframe[src*="embed"], iframe[src*="video"]').attr('src')
                    || $('iframe').first().attr('src')
                    || $('video source').attr('src')
                    || $('video').attr('src')
                    || '';

        if (videoUrl.startsWith('//')) videoUrl = `https:${videoUrl}`;

        if (videoUrl) {
          console.log(`✅ Cheerio extrajo: ${videoUrl.substring(0, 80)}...`);
          return res.json({ success: true, url: videoUrl, title: movie.title });
        }

        return res.status(500).json({ 
          success: false, 
          message: 'No se pudo extraer el link de video',
          error: stderr 
        });

      } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
      }
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
