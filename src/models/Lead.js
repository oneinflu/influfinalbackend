// Lead model: track inbound leads, their desired services, and assignment
// Implements your schema with validation, enums, and snake_case timestamps.

import mongoose from 'mongoose';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/; // E.164-like
function isURL(value) {
  if (!value) return true; // allow empty
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Main Lead schema
const LeadSchema = new mongoose.Schema(
  {
    // Contact info
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, match: [EMAIL_REGEX, 'Invalid email address'], index: true },
    phone: { type: String, trim: true, match: [PHONE_REGEX, 'Invalid phone number'], index: true },
    website: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },

    // Budget (numeric); leave currency handling to business logic
    budget: { type: Number, min: 0 },

    // Services the lead is looking for (array of Service IDs)
    looking_for: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],

    // Lead status lifecycle
    status: {
      type: String,
      enum: ['new_lead', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost', 'closed'],
      default: 'new_lead',
      index: true,
    },

    // Assigned team member handling this lead
    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', index: true },
  },
  {
    timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Helpful indexes
LeadSchema.index({ looking_for: 1 });
LeadSchema.index({ status: 1, assigned_to: 1 });
LeadSchema.index({ created_on: 1 });

// Ensure looking_for contains unique ids
LeadSchema.pre('validate', function (next) {
  if (Array.isArray(this.looking_for)) {
    const set = new Set(this.looking_for.map((id) => String(id)));
    this.looking_for = Array.from(set).map((s) => new mongoose.Types.ObjectId(s));
  }
  next();
});

const Lead = mongoose.model('Lead', LeadSchema);
export default Lead;