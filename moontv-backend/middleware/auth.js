// middleware/auth.js
const jwt  = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) throw new Error('Usuario no encontrado');
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }
};

// Middleware para rutas de admin (usa ADMIN_KEY del .env)
exports.adminAuth = (req, res, next) => {
  if (['POST','PUT','DELETE','PATCH'].includes(req.method)) {
    const key = req.headers['x-admin-key'] || req.query.adminKey;
    if (!key || key !== process.env.ADMIN_KEY) {
      return res.status(401).json({ success: false, message: 'Acceso de admin no autorizado' });
    }
  }
  next();
};
