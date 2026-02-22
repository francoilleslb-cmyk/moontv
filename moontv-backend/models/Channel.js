// models/Channel.js
const mongoose = require('mongoose');

const ServerSchema = new mongoose.Schema({
  label:     { type: String, default: 'HD' },
  url:       { type: String, required: true },
  type:      { type: String, default: 'hls', enum: ['hls','mp4','rtmp','dash'] },
  isWorking: { type: Boolean, default: true },
}, { _id: false });

const ChannelSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  slug:        { type: String, unique: true, lowercase: true },
  logo:        { type: String, default: '' },
  thumbnail:   { type: String, default: '' },
  category:    { type: String, default: 'General' },
  country:     { type: String, default: 'AR', uppercase: true, maxlength: 2 },
  language:    { type: String, default: 'es' },
  description: { type: String, default: '' },
  streamUrl:   { type: String, default: '' },    // stream principal
  servers:     { type: [ServerSchema], default: [] },  // fallbacks
  status:      { type: String, enum: ['active','inactive','testing'], default: 'active' },
  isPaid:      { type: Boolean, default: false },
  isAdult:     { type: Boolean, default: false },
  isFeatured:  { type: Boolean, default: false },
  currentProgram: { type: String, default: '' },
  sortOrder:   { type: Number, default: 0 },
  viewCount:   { type: Number, default: 0 },
  tags:        { type: [String], default: [] },
}, { timestamps: true, toJSON: { virtuals: true } });

// Auto-slug
ChannelSchema.pre('save', function(next) {
  if (!this.slug || this.isModified('name')) {
    this.slug = this.name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  }
  if (!this.streamUrl && this.servers.length > 0) {
    this.streamUrl = this.servers[0].url;
  }
  next();
});

ChannelSchema.index({ category: 1 });
ChannelSchema.index({ status: 1, sortOrder: 1 });
ChannelSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Channel', ChannelSchema);
