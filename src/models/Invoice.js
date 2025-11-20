// Invoice model: tracks invoices, amounts, status, and associations
// Implements your schema with validation, enums, references, indexes, and snake_case timestamps.

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

const InvoiceSchema = new mongoose.Schema(
  {
    // Unique invoice number (e.g., INV-2025-0001)
    invoice_number: { type: String, required: true, trim: true, unique: true, index: true },

    // Dates
    issue_date: { type: Date, required: true, index: true },
    due_date: { type: Date, index: true },

    // Amounts and tax
    tax_percentage: { type: Number, min: 0, max: 100, default: 0 },
    subtotal: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },

    // Currency
    currency: { type: String, enum: ['INR', 'USD', 'EUR', 'GBP'], default: 'INR', uppercase: true, index: true },

    // Payment status lifecycle
    payment_status: {
      type: String,
      enum: ['pending', 'partially_paid', 'paid', 'overdue', 'cancelled'],
      default: 'pending',
      index: true,
    },

    // PDF download URL
    pdf_url: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },

    // Associations
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },

    // Linked payments
    payments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: [] }],

    // Notes
    notes: { type: String, trim: true, maxlength: 2000 },
  },
  {
    timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for common queries
InvoiceSchema.index({ created_by: 1, client: 1, issue_date: 1 });
InvoiceSchema.index({ due_date: 1, payment_status: 1 });
InvoiceSchema.index({ project: 1 });

// Normalize and validate amounts before saving
InvoiceSchema.pre('validate', function (next) {
  // Ensure totals are consistent: total = subtotal + tax
  const subtotal = typeof this.subtotal === 'number' ? this.subtotal : 0;
  const taxPct = typeof this.tax_percentage === 'number' ? this.tax_percentage : 0;
  if (taxPct < 0 || taxPct > 100) {
    return next(new Error('tax_percentage must be between 0 and 100'));
  }
  const computedTotal = Number((subtotal * (1 + taxPct / 100)).toFixed(2));
  // If total is not set or differs, set computed total
  if (this.total == null || Math.abs(this.total - computedTotal) > 0.009) {
    this.total = computedTotal;
  }
  // Dedupe payments array
  if (Array.isArray(this.payments)) {
    const set = new Set(this.payments.map((id) => String(id)));
    this.payments = Array.from(set).map((s) => new mongoose.Types.ObjectId(s));
  }
  next();
});

const Invoice = mongoose.model('Invoice', InvoiceSchema);
export default Invoice;