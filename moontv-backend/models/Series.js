const mongoose = require('mongoose');
const EpisodeSchema = new mongoose.Schema({
  title:    { type: String, default: '' },
  number:   { type: Number },
  season:   { type: Number, default: 1 },
  streamUrl:{ type: String, default: '' },
  duration: { type: String, default: '' },
}, { _id: false });
const SeriesSchema = new mongoose.Schema({
  title:         { type: String, required: true, trim: true },
  originalTitle: { type: String, default: '' },
  poster:        { type: String, default: '' },
  backdrop:      { type: String, default: '' },
  synopsis:      { type: String, default: '' },
  description:   { type: String, default: '' },
  genre:         { type: String, default: '' },
  genres:        [{ type: String }],
  category:      { type: String, default: '' },
  year:          { type: Number },
  rating:        { type: Number, default: 0 },
  seasons:       { type: Number, default: 1 },
  episodes:      { type: Number, default: 0 },
  episodeList:   { type: [EpisodeSchema], default: [] },
  streamUrl:     { type: String, default: '' },
  embedType:     { type: String, default: 'direct' },
  imdbId:        { type: String, default: '' },
  tmdbId:        { type: Number },
  trailer:       { type: String, default: '' },
  status:        { type: String, enum: ['active','inactive'], default: 'active' },
  isPaid:        { type: Boolean, default: false },
  isFeatured:    { type: Boolean, default: false },
  sortOrder:     { type: Number, default: 0 },
}, { timestamps: true });
SeriesSchema.index({ title: 'text', description: 'text', genre: 'text' });
SeriesSchema.index({ status: 1, sortOrder: 1 });
SeriesSchema.index({ imdbId: 1 });
SeriesSchema.index({ tmdbId: 1 });
module.exports = mongoose.model('Series', SeriesSchema);
