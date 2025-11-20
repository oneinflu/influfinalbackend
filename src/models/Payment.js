// Payment model: records payments against invoices with payer/receiver refs
// Implements your schema with validation, enums, indexes, and snake_case timestamps.

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

const PaymentSchema = new mongoose.Schema(
  {
    // Date when payment occurred
    payment_date: { type: Date, required: true, index: true },

    // Amount paid (numeric)
    amount: { type: Number, required: true, min: 0 },

    // Mode of payment
    mode: { type: String, enum: ['BANK', 'UPI'], required: true, index: true },

    // External transaction identifier (if any)
    transaction_id: { type: String, trim: true, unique: true, sparse: true, index: true },

    // Notes or remarks
    remarks: { type: String, trim: true, maxlength: 1000 },

    // Receipt URL
    receipt_url: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },

    // Verification state
    is_verified: { type: Boolean, default: false, index: true },

    // References
    invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    received_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Helpful indexes for reporting and lookups
PaymentSchema.index({ invoice_id: 1, payment_date: 1 });
PaymentSchema.index({ paid_by: 1, payment_date: 1 });
PaymentSchema.index({ received_by: 1, payment_date: 1 });

// Export model
const Payment = mongoose.model('Payment', PaymentSchema);
export default Payment;