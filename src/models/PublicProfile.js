// PublicProfile model: public-facing profile data for a User
// Implements your schema with refs, stats sub-docs, validation, indexes, and snake_case timestamps.

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

const StatsSchema = new mongoose.Schema(
  {
    clients: { type: Number, min: 0, default: 0 },
    team_members: { type: Number, min: 0, default: 0 },
    projects: { type: Number, min: 0, default: 0 },
    years_in_business: { type: String, trim: true, default: '' },
    avg_rating: { type: Number, min: 0, max: 5, default: 0 },
  },
  { _id: false }
);

const PublicProfileSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

    cover_photo: { type: String, trim: true, validate: [isURL, 'Invalid cover photo URL'] },

    stats: { type: [StatsSchema], default: [] },

    featured_clients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: [] }],

    // Explicit selections for what to show publicly
    published_services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: [] }],
    published_projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: [] }],

    bio: { type: String, trim: true, maxlength: 2000 },

    showcase_media: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', default: [] }],
  },
  {
    timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Dedupe arrays and keep stats sane
PublicProfileSchema.pre('validate', function (next) {
  const dedupeObjectIds = (arr) => {
    if (!Array.isArray(arr)) return [];
    const set = new Set(arr.map((id) => String(id)).filter((s) => s));
    return Array.from(set).map((s) => new mongoose.Types.ObjectId(s));
  };

  this.featured_clients = dedupeObjectIds(this.featured_clients);
  this.published_services = dedupeObjectIds(this.published_services);
  this.published_projects = dedupeObjectIds(this.published_projects);
  this.showcase_media = dedupeObjectIds(this.showcase_media);

  if (Array.isArray(this.stats)) {
    this.stats = this.stats.map((s) => ({
      clients: typeof s.clients === 'number' && s.clients >= 0 ? s.clients : 0,
      team_members: typeof s.team_members === 'number' && s.team_members >= 0 ? s.team_members : 0,
      projects: typeof s.projects === 'number' && s.projects >= 0 ? s.projects : 0,
      years_in_business: typeof s.years_in_business === 'string' ? s.years_in_business.trim() : '',
      avg_rating:
        typeof s.avg_rating === 'number'
          ? Math.max(0, Math.min(5, s.avg_rating))
          : 0,
    }));
  } else {
    this.stats = [];
  }
  next();
});

// Helpful indexes for queries
PublicProfileSchema.index({ 'stats.avg_rating': 1 });
PublicProfileSchema.index({ featured_clients: 1 });
PublicProfileSchema.index({ published_services: 1 });
PublicProfileSchema.index({ published_projects: 1 });
PublicProfileSchema.index({ showcase_media: 1 });

const PublicProfile = mongoose.model('PublicProfile', PublicProfileSchema);
export default PublicProfile;