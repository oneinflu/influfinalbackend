// Project model: tracks client projects, services, collaborators, deliverables, and targeting
// Implements your schema with validation, references, normalization, indexes, and snake_case timestamps.

import mongoose from 'mongoose';

const TargetSchema = new mongoose.Schema(
  {
    location: { type: [String], default: [] },
    platforms: {
      type: [String],
      default: [],
      // Optional: normalize common platform names
    },
    age_groups: { type: [String], default: [] },
    languages: { type: [String], default: [] },
  },
  { _id: false }
);

const ProjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },

    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },

    project_category: { type: [String], default: [] },

    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: [] }],

    testimonials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Testimonial', default: [] }],

    completion_date: { type: Date, index: true },
    end_date: { type: Date, index: true },

    project_budget: { type: Number, min: 0, default: 0 },

    status: {
      type: String,
      enum: ['draft', 'in_progress', 'completed', 'cancelled', 'on_hold'],
      default: 'draft',
      index: true,
    },

    approval_status: {
      type: String,
      enum: ['awaiting_approval', 'approved', 'rejected'],
      default: 'awaiting_approval',
      index: true,
    },

    collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collaborator', default: [] }],

    deliverables: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Milestone', default: [] }],

    target: { type: TargetSchema, default: {} },

    notes: { type: String, trim: true, maxlength: 3000 },
  },
  {
    timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Normalize array fields: trim and dedupe
ProjectSchema.pre('validate', function (next) {
  const dedupeStrings = (arr) => {
    if (!Array.isArray(arr)) return [];
    const set = new Set(
      arr
        .filter((v) => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    );
    return Array.from(set);
  };

  const dedupeObjectIds = (arr) => {
    if (!Array.isArray(arr)) return [];
    const set = new Set(arr.map((id) => String(id)).filter((s) => s));
    return Array.from(set).map((s) => new mongoose.Types.ObjectId(s));
  };

  this.project_category = dedupeStrings(this.project_category);
  if (this.target) {
    this.target.location = dedupeStrings(this.target.location);
    this.target.platforms = dedupeStrings(this.target.platforms).map((p) => {
      const norm = p.toLowerCase();
      if (norm === 'instagram') return 'Instagram';
      if (norm === 'youtube') return 'YouTube';
      if (norm === 'tiktok') return 'TikTok';
      return p;
    });
    this.target.age_groups = dedupeStrings(this.target.age_groups);
    this.target.languages = dedupeStrings(this.target.languages);
  }

  this.services = dedupeObjectIds(this.services);
  this.testimonials = dedupeObjectIds(this.testimonials);
  this.collaborators = dedupeObjectIds(this.collaborators);
  this.deliverables = dedupeObjectIds(this.deliverables);

  // Optional sanity check: ensure end_date is not before completion_date
  if (this.end_date && this.completion_date && this.end_date < this.completion_date) {
    return next(new Error('end_date cannot be earlier than completion_date'));
  }
  next();
});

// Indexes for common queries and lookups
ProjectSchema.index({ client: 1, status: 1, end_date: 1 });
ProjectSchema.index({ approval_status: 1, updated_on: 1 });
ProjectSchema.index({ project_category: 1 });
ProjectSchema.index({ services: 1 });
ProjectSchema.index({ collaborators: 1 });
ProjectSchema.index({ deliverables: 1 });
ProjectSchema.index({ 'target.platforms': 1 });
ProjectSchema.index({ name: 1, client: 1 }, { unique: true });

const Project = mongoose.model('Project', ProjectSchema);
export default Project;