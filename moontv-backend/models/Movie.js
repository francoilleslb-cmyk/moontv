// models/Movie.js
const mongoose = require('mongoose');

const MovieSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  poster:      { type: String, default: '' },
  backdrop:    { type: String, default: '' },
  description: { type: String, default: '' },
  genre:       { type: String, default: '' },
  category:    { type: String, default: '' },
  year:        { type: Number },
  duration:    { type: String, default: '' },
  rating:      { type: Number, default: 0 },
  streamUrl:   { type: String, default: '' },
  trailer:     { type: String, default: '' },
  status:      { type: String, enum: ['active','inactive'], default: 'active' },
  isPaid:      { type: Boolean, default: false },
  isFeatured:  { type: Boolean, default: false },
  sortOrder:   { type: Number, default: 0 },
}, { timestamps: true });

MovieSchema.index({ title: 'text', description: 'text', genre: 'text' });
MovieSchema.index({ status: 1, sortOrder: 1 });

module.exports = mongoose.model('Movie', MovieSchema);
