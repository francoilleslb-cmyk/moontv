// routes/events.js
const express = require('express');
const router  = express.Router();
const Event   = require('../models/Event');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/today', async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now); start.setHours(0,0,0,0);
    const end   = new Date(now); end.setHours(23,59,59,999);
    const events = await Event.find({ datetime: { $gte: start, $lte: end }, isActive: true }).sort({ datetime: 1 });
    res.json({ success: true, count: events.length, data: events });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { sport, status, days = 7, all } = req.query;
    const now    = new Date();
    const future = new Date(); future.setDate(future.getDate() + +days);
    const filter = all ? {} : { datetime: { $gte: now, $lte: future }, isActive: true };
    if (sport)  filter.sport  = sport;
    if (status) filter.status = status;
    const events = await Event.find(filter).sort({ datetime: 1 });
    res.json({ success: true, count: events.length, data: events });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    res.json({ success: true, data: event });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const event = await Event.create(req.body);
    res.status(201).json({ success: true, data: event, message: 'Evento creado' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!event) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: event, message: 'Evento actualizado' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/:id/status', async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, data: event });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Evento eliminado' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
