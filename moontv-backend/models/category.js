// models/Category.js
const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  icon:        { type: String, default: '📺' },
  sortOrder:   { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Category', CategorySchema);
