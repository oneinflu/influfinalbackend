// Milestone model: tracks deliverable milestones, uploads, invoice attachment, and status
// Implements your schema with validation, refs, indexes, and snake_case timestamps.

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

const UploadSchema = new mongoose.Schema(
  {
    file_name: { type: String, required: true, trim: true },
    file_url: { type: String, required: true, trim: true, validate: [isURL, 'Invalid URL'] },
    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    uploaded_on: { type: Date, required: true, index: true },
  },
  { _id: false }
);

const InvoiceAttachmentSchema = new mongoose.Schema(
  {
    invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    attached_on: { type: Date },
  },
  { _id: false }
);

const MilestoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 3000 },
    due_date: { type: Date, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },

    uploads: { type: [UploadSchema], default: [] },

    invoice_attached: { type: InvoiceAttachmentSchema, default: { invoice_id: null } },

    status: {
      type: String,
      enum: ['yet_to_start', 'in_progress', 'submitted', 'approved', 'rejected', 'completed'],
      default: 'yet_to_start',
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure invoice attachment has a timestamp when invoice is present
MilestoneSchema.pre('validate', function (next) {
  if (this.invoice_attached && this.invoice_attached.invoice_id) {
    if (!this.invoice_attached.attached_on) {
      this.invoice_attached.attached_on = new Date();
    }
  }
  next();
});

// Helpful indexes for common queries
MilestoneSchema.index({ due_date: 1, status: 1 });
MilestoneSchema.index({ 'invoice_attached.invoice_id': 1 });
MilestoneSchema.index({ created_on: 1 });

const Milestone = mongoose.model('Milestone', MilestoneSchema);
export default Milestone;