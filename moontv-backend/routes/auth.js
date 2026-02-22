// routes/auth.js
const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Completá todos los campos' });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ success: false, message: 'El email ya está registrado' });

    const user  = await User.create({ name, email, password });
    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      data: { id: user._id, name: user.name, email: user.email, token },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Ingresá email y contraseña' });

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ success: false, message: 'Email o contraseña incorrectos' });

    const token = signToken(user._id);
    res.json({
      success: true,
      data: { id: user._id, name: user.name, email: user.email, avatar: user.avatar, token },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me  (requiere JWT)
router.get('/me', protect, async (req, res) => {
  const user = req.user;
  res.json({
    success: true,
    data: { id: user._id, name: user.name, email: user.email, avatar: user.avatar, favorites: user.favorites },
  });
});

// PUT /api/auth/update-profile  (requiere JWT)
router.put('/update-profile', protect, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { ...(name && { name }), ...(avatar && { avatar }) },
      { new: true }
    ).select('-password');
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
