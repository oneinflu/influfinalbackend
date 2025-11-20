// Service model: what a user offers, with pricing plans and deliverables
// Matches your schema with validation, enums, and snake_case timestamps.

import mongoose from 'mongoose';

// Pricing plan sub-schema
const PricingPlanSchema = new mongoose.Schema(
  {
    currency: {
      type: String,
      enum: ['INR', 'USD', 'EUR', 'GBP'],
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    is_price_range: { type: Boolean, default: false },
    amount: { type: Number, min: 0 },
    percentage: { type: Number, min: 0, max: 100, default: 0 },
    range: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
    },
    pre_discounted_rate: { type: Number, min: 0 },
    plan_type: {
      type: String,
      enum: ['per_project', 'per_post', 'per_month', 'retainer', 'hourly'],
      default: 'per_project',
    },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

// Validate pricing rules
PricingPlanSchema.pre('validate', function (next) {
  // If using a price range, require range.min and range.max and ensure max >= min
  if (this.is_price_range) {
    const min = this.range?.min;
    const max = this.range?.max;
    if (min == null || max == null) {
      return next(new Error('Price range requires both min and max'));
    }
    if (max < min) {
      return next(new Error('Price range max must be greater than or equal to min'));
    }
    // amount can be omitted when range is used
    this.amount = this.amount ?? undefined;
  } else {
    // Not a price range: amount is required
    if (this.amount == null) {
      return next(new Error('Amount is required when is_price_range is false'));
    }
    // Clean range if not used
    this.range = undefined;
  }
  next();
});

// Main Service schema
const ServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true },

    // List of deliverables (free-text strings)
    deliverables: { type: [String], default: [] },

    // Pricing flags
    is_contact_for_pricing: { type: Boolean, default: false },
    is_barter: { type: Boolean, default: false },
    is_negotiable: { type: Boolean, default: false },

    // Owner user who offers this service
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Supported content types for this service
    content_types: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContentType' }],

    // One or more pricing plans
    pricing_plans: { type: [PricingPlanSchema], default: [] },

    // Service lifecycle status
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active', index: true },
  },
  {
    timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Normalize and dedupe deliverables
ServiceSchema.pre('validate', function (next) {
  if (Array.isArray(this.deliverables)) {
    const cleaned = this.deliverables
      .filter((d) => typeof d === 'string')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    const set = new Set(cleaned.map((d) => d.toLowerCase()));
    // Preserve original casing of first occurrence
    const unique = [];
    for (const d of cleaned) {
      const k = d.toLowerCase();
      if (!set.has(k)) continue; // should not happen
      if (!unique.some((u) => u.toLowerCase() === k)) unique.push(d);
    }
    this.deliverables = unique;
  }
  next();
});

// Helpful indexes
ServiceSchema.index({ user_id: 1, status: 1 });
ServiceSchema.index({ 'pricing_plans.plan_type': 1 });
ServiceSchema.index({ name: 1, user_id: 1 }, { unique: true }); // prevent duplicate service names per user
ServiceSchema.index({ content_types: 1 });

const Service = mongoose.model('Service', ServiceSchema);
export default Service;