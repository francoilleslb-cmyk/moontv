// models/Movie.js
const mongoose = require('mongoose');

const MovieSchema = new mongoose.Schema({
  title:            { type: String, required: true, trim: true },
  originalTitle:    { type: String, default: '' },
  poster:           { type: String, default: '' },
  backdrop:         { type: String, default: '' },
  synopsis:         { type: String, default: '' },
  description:      { type: String, default: '' },
  genre:            { type: String, default: '' },         // legado, no borrar
  genres:           [{ type: String }],                    // array completo de géneros
  category:         { type: String, default: '' },         // género principal (genres[0])
  language:         { type: String, default: '' },         // ← NUEVO: 'es', 'en', etc.
  year:             { type: Number },
  duration:         { type: String, default: '' },
  rating:           { type: Number, default: 0 },
  streamUrl:        { type: String, default: '' },
  embedType:        { type: String, default: 'direct' },
  imdbId:           { type: String, default: '' },
  tmdbId:           { type: Number },
  trailer:          { type: String, default: '' },
  status:           { type: String, enum: ['active', 'inactive'], default: 'active' },
  isPaid:           { type: Boolean, default: false },
  isFeatured:       { type: Boolean, default: false },
  sortOrder:        { type: Number, default: 0 },
}, { timestamps: true });

MovieSchema.index({ title: 'text', description: 'text', genre: 'text' });
MovieSchema.index({ status: 1, sortOrder: 1 });
MovieSchema.index({ imdbId: 1 });
MovieSchema.index({ tmdbId: 1 });
MovieSchema.index({ language: 1 });    // ← para filtrar por idioma rápido
MovieSchema.index({ category: 1 });   // ← para filtrar por categoría rápido

module.exports = mongoose.model('Movie', MovieSchema);
