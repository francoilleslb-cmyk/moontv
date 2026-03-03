const express = require('express');
const router = express.Router();
const Movie = require('../models/Movie');
const { adminAuth } = require('../middleware/auth');
const puppeteer = require('puppeteer');

async function extraerM3U8(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process']
  });
  try {
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Obtener el data-server del primer li
    const embedUrl = await page.evaluate(() => {
      const li = document.querySelector('.tab-video-item li');
      return li ? li.dataset.server : null;
    });

    console.log('Embed URL: ' + embedUrl);

    if (!embedUrl) {
      await browser.close();
      return null;
    }

    // Navegar al embed y capturar m3u8
    const page2 = await browser.newPage();
    let m3u8Url = null;

    await page2.setRequestInterception(true);
    page2.on('request', request => {
      const reqUrl = request.url();
      if (reqUrl.includes('.m3u8')) {
        m3u8Url = reqUrl;
        console.log('M3U8: ' + reqUrl);
      }
      request.continue();
    });

    browser.on('targetcreated', async target => {
      const newPage = await target.page();
      if (!newPage) return;
      await newPage.setRequestInterception(true).catch(() => {});
      newPage.on('request', request => {
        const reqUrl = request.url();
        if (reqUrl.includes('.m3u8')) {
          m3u8Url = reqUrl;
          console.log('M3U8 iframe: ' + reqUrl);
        }
        request.continue().catch(() => {});
      });
    });

    await page2.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    // Intentar click en play
    const selectors = ['.jw-icon-playback','.jw-icon-display','.jw-display-icon-container','video','button'];
    for (const s of selectors) {
      try { await page2.click(s); console.log('CLICK: ' + s); break; } catch(e) {}
    }

    await new Promise(resolve => {
      const iv = setInterval(() => { if (m3u8Url) { clearInterval(iv); resolve(); } }, 500);
      setTimeout(() => { clearInterval(iv); resolve(); }, 15000);
    });

    await browser.close();
    return m3u8Url;
  } catch (e) {
    await browser.close();
    throw e;
  }
}

router.get('/:id/play', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie || !movie.streamUrl) return res.status(404).json({ success: false, message: 'URL no disponible' });
    console.log('Extrayendo: ' + movie.streamUrl);
    const m3u8Url = await extraerM3U8(movie.streamUrl);
    if (!m3u8Url) return res.status(500).json({ success: false, message: 'No se encontro video' });
    res.json({ success: true, url: m3u8Url, title: movie.title });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const movies = await Movie.find({ status: 'active', $or: [{ title: { $regex: q, $options: 'i' } }, { category: { $regex: q, $options: 'i' } }] }).limit(30);
    res.json({ success: true, data: movies });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/delete-all', adminAuth, async (req, res) => {
  try {
    const { confirm, all } = req.query;
    if (confirm !== 'true') return res.status(400).json({ success: false, message: 'Requiere ?confirm=true' });
    const result = await Movie.deleteMany(all === 'true' ? {} : { status: 'active' });
    res.json({ success: true, message: 'Eliminadas: ' + result.deletedCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, all } = req.query;
    const filter = all ? {} : { status: 'active' };
    if (category) filter.category = category;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [movies, total] = await Promise.all([Movie.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(+limit), Movie.countDocuments(filter)]);
    res.json({ success: true, data: movies, pagination: { page: +page, limit: +limit, total } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: movie });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', adminAuth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, data: movie, message: 'Creada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/:id', adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!movie) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: movie, message: 'Actualizada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, data: movie });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, message: 'Eliminada' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
