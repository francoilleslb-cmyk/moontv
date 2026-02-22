// models/Event.js
const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  competition: { type: String, required: true },
  sport:       { type: String, enum: ['football','basketball','tennis','boxing','formula1','other'], default: 'football' },
  countryCode: { type: String, default: 'AR', uppercase: true, maxlength: 2 },
  teamHome:    { type: String, default: '' },
  teamAway:    { type: String, default: '' },
  logoHome:    { type: String, default: '' },
  logoAway:    { type: String, default: '' },
  datetime:    { type: Date, required: true },
  channels: [{
    name:      { type: String, required: true },
    streamUrl: { type: String, required: true },
    logo:      { type: String, default: '' },
    channelRef:{ type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
  }],
  status:   { type: String, enum: ['upcoming','live','finished'], default: 'upcoming' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

EventSchema.index({ datetime: 1 });
EventSchema.index({ status: 1 });

module.exports = mongoose.model('Event', EventSchema);
