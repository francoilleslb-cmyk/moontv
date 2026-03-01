const express = require('express');
const router = express.Router();
const Movie = require('../models/Movie');
const { adminAuth } = require('../middleware/auth');
const puppeteer = require('puppeteer');

async function extraerM3U8(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ]
  });

  try {
    const page = await browser.newPage();
    let m3u8Url = null;

    // ✅ Interceptar requests de TODAS las páginas incluyendo iframes
    browser.on('targetcreated', async target => {
      const newPage = await target.page();
      if (!newPage) return;

      await newPage.setRequestInterception(true).catch(() => {});
      newPage.on('request', request => {
        const reqUrl = request.url();
        if (reqUrl.includes('.m3u8')) {
          m3u8Url = reqUrl;
          console.log(`🎯 m3u8 capturado en iframe: ${reqUrl}`);
        }
        request.continue().catch(() => {});
      });
    });

    await page.setRequestInterception(true);
    page.on('request', request => {
      const reqUrl = request.url();
      const resourceType = request.resourceType();

      if (reqUrl.includes('.m3u8')) {
        m3u8Url = reqUrl;
        console.log(`🎯 m3u8 capturado: ${reqUrl}`);
      }

      if (['image', 'font', 'stylesheet'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
✅ LOG temporal
page.on('response', response => {
  const reqUrl = response.url();
  if (!reqUrl.includes('google') && !reqUrl.includes('analytics')) {
    console.log(`📡 ${reqUrl.substring(0, 100)}`);
  }
});
    
    // Esperar que cargue el iframe y el player
    await new Promise(r => setTimeout(r, 5000));

    // Intentar click en play en varios selectores posibles
    const playSelectors = [
      '.jw-icon-playback',
      '.jw-icon-display',
      '.jw-display-icon-container',
      'button[aria-label="Play"]',
      '.play-button',
      'video'
    ];

    for (const selector of playSelectors) {
      try {
        await page.click(selector);
        console.log(`✅ Click en ${selector}`);
        break;
      } catch {}
    }

    // Esperar hasta 20 segundos al m3u8
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (m3u8Url) {
          clearInterval(interval);
          resolve();
        }
      }, 500);
      setTimeout(() => { clearInterval(interval); resolve(); }, 20000);
    });

    await browser.close();
    return m3u8Url;

  } catch (e) {
    await browser.close();
    throw e;
  }
}

// 🎥 RUTA DE REPRODUCCIÓN
router.get('/:id/play', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie || !movie.streamUrl) {
      return res.status(404).json({ success: false, message: 'URL no disponible' });
    }

    console.log(`🎬 Extrayendo m3u8 de: ${movie.streamUrl}`);
    const m3u8Url = await extraerM3U8(movie.streamUrl);

    if (!m3u8Url) {
      return res.status(500).json({ success: false, message: 'No se encontró ningún vídeo' });
    }

    console.log(`✅ Devolviendo: ${m3u8Url}`);
    res.json({ success: true, url: m3u8Url, title: movie.title });

  } catch (err) {
    console.error('❌ Error en /play:', err.message);
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

// 🗑️ BORRAR TODAS
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
