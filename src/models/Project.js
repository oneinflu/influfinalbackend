// Project model: tracks client projects, services, collaborators, deliverables, and targeting
// Implements your schema with validation, references, normalization, indexes, and snake_case timestamps.

import mongoose from 'mongoose';

function isURL(value) {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

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

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 2000 },
    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'Collaborator' },
    due_date: { type: Date },
    status: { type: String, enum: ['todo', 'in_progress', 'done', 'blocked'], default: 'todo', index: true },
  },
  { _id: true }
);

const InternalCostSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    incurred_on: { type: Date },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: true }
);

const DeliverySystemSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ['drive', 'email', 'platform', 'courier', 'other'], default: 'drive' },
    url: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
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

    quotation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', index: true },
    final_confirmed_rate_cards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RateCard', default: [] }],
    assigned_collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collaborator', default: [] }],
    milestones: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Milestone', default: [] }],
    tasks: { type: [TaskSchema], default: [] },
    internal_costs: { type: [InternalCostSchema], default: [] },
    invoices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: [] }],
    delivery_system: { type: DeliverySystemSchema, default: {} },

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
  this.final_confirmed_rate_cards = dedupeObjectIds(this.final_confirmed_rate_cards);
  this.assigned_collaborators = dedupeObjectIds(this.assigned_collaborators);
  this.milestones = dedupeObjectIds(this.milestones);
  this.invoices = dedupeObjectIds(this.invoices);

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
ProjectSchema.index({ quotation_id: 1 });
ProjectSchema.index({ final_confirmed_rate_cards: 1 });
ProjectSchema.index({ assigned_collaborators: 1 });
ProjectSchema.index({ milestones: 1 });
ProjectSchema.index({ invoices: 1 });
ProjectSchema.index({ 'target.platforms': 1 });
ProjectSchema.index({ name: 1, client: 1 }, { unique: true });

const Project = mongoose.model('Project', ProjectSchema);
export default Project;
