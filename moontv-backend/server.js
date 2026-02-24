require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Panel de admin (HTML estático) ───────────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Conectar MongoDB ─────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅  MongoDB conectado'))
  .catch(err => { console.error('❌  MongoDB:', err.message); process.exit(1); });

// ── Rutas API ────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/movies', require('./routes/movies'));
app.use('/api/series', require('./routes/series'));
app.use('/api/events', require('./routes/events'));
app.use('/api/categories', require('./routes/categories'));

// ── Raíz ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/admin'));

app.get('/api', (req, res) => res.json({
  name: 'Moon TV API',
  version: '3.0',
  endpoints: {
    auth: '/api/auth',
    channels: '/api/channels',
    movies: '/api/movies',
    series: '/api/series',
    events: '/api/events',
    admin: '/admin',
  }
}));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: 'Ruta no encontrada' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌙  Moon TV corriendo en http://localhost:${PORT}`);
  console.log(`🎛️   Panel admin: http://localhost:${PORT}/admin`);
});
