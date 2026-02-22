// routes/movies.js
const express = require('express');
const router  = express.Router();
const Movie   = require('../models/Movie');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const movies = await Movie.find({
      status: 'active',
      $or: [{ title: { $regex: q, $options: 'i' } }, { genre: { $regex: q, $options: 'i' } }],
    }).limit(30);
    res.json({ success: true, data: movies });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, genre, all } = req.query;
    const filter = all ? {} : { status: 'active' };
    if (genre) filter.genre = genre;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [movies, total] = await Promise.all([
      Movie.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(+limit),
      Movie.countDocuments(filter),
    ]);
    res.json({ success: true, data: movies, pagination: { page: +page, limit: +limit, total } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'Película no encontrada' });
    res.json({ success: true, data: movie });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, data: movie, message: 'Película creada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!movie) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: movie, message: 'Película actualizada' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, data: movie });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, message: `"${movie.title}" eliminada` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
