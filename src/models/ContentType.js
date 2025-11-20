// ContentType model: catalog of content types (e.g., Reel, Story, Video)
// Simple schema with unique name and status, linkable from Services

import mongoose from 'mongoose';

function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ContentTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, index: true },
    slug: { type: String, unique: true, sparse: true, index: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ContentTypeSchema.pre('validate', function (next) {
  if (this.name && !this.slug) {
    this.slug = slugify(this.name);
  }
  next();
});

ContentTypeSchema.index({ name: 1 }, { unique: true });
ContentTypeSchema.index({ slug: 1 }, { unique: true, sparse: true });

const ContentType = mongoose.model('ContentType', ContentTypeSchema);
export default ContentType;