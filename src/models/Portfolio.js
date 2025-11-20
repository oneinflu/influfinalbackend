// Portfolio model: user-owned media assets (images/videos) with tags and status
// Implements your schema with validation, refs, normalization, indexes, and snake_case timestamps.

import mongoose from 'mongoose';

function isURL(value) {
  if (!value) return true; // allow empty
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const PortfolioSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document'],
      required: true,
      index: true,
    },

    belongs_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    media_url: { type: String, required: true, trim: true, validate: [isURL, 'Invalid media URL'] },
    thumbnail_url: { type: String, trim: true, validate: [isURL, 'Invalid thumbnail URL'] },

    // File sizes in bytes for storage usage computations
    size_bytes: { type: Number, default: 0, min: 0 },
    thumbnail_size_bytes: { type: Number, default: 0, min: 0 },

    title: { type: String, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },

    tags: { type: [String], default: [], index: true },

    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active', index: true },
  },
  {
    timestamps: { createdAt: 'uploaded_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Normalize and dedupe tags
PortfolioSchema.pre('validate', function (next) {
  if (Array.isArray(this.tags)) {
    const set = new Set(
      this.tags
        .filter((v) => typeof v === 'string')
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length > 0)
    );
    this.tags = Array.from(set);
  } else {
    this.tags = [];
  }
  next();
});

// Helpful indexes
PortfolioSchema.index({ belongs_to: 1, uploaded_on: 1 });
PortfolioSchema.index({ type: 1, status: 1 });
// Avoid duplicate media per owner
PortfolioSchema.index({ belongs_to: 1, media_url: 1 }, { unique: true });

const Portfolio = mongoose.model('Portfolio', PortfolioSchema);
export default Portfolio;