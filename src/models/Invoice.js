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

const { Schema } = mongoose;

const LineItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
    rateCardId: { type: Schema.Types.ObjectId, ref: 'RateCard', default: null },
    qty: { type: Number, required: true, min: 0, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    taxRatePercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
  },
  { _id: true }
);

const TaxBreakdownSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ratePercent: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const PaymentRecordSchema = new Schema(
  {
    paymentId: { type: String, default: null, trim: true },
    paidAt: { type: Date, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    method: { type: String, enum: ['bank_transfer','upi','card','wallet','cheque','cash','other'], default: 'bank_transfer' },
    reference: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
  },
  { _id: true }
);

const InvoiceSchema = new Schema(
  {
    // New fields
    invoiceNo: { type: String, required: true, unique: true, trim: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', default: null },

    clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    issuedTo: {
      name: { type: String, required: true, trim: true },
      company: { type: String, default: null, trim: true },
      billingAddress: { type: String, default: null, trim: true },
      email: { type: String, default: null, trim: true },
      phone: { type: String, default: null, trim: true },
      gstNumber: { type: String, default: null, trim: true },
    },

    currency: { type: String, default: 'INR' },
    items: { type: [LineItemSchema], default: [] },

    subTotal: { type: Number, required: true, default: 0 },
    taxes: { type: [TaxBreakdownSchema], default: [] },
    total: { type: Number, required: true, default: 0 },

    payments: { type: [PaymentRecordSchema], default: [] },
    paidAmount: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },

    status: { type: String, enum: ['draft','sent','partial','paid','overdue','cancelled','disputed'], default: 'draft' },

    issuedAt: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    paidAt: { type: Date, default: null },

    taxInclusive: { type: Boolean, default: false },
    notes: { type: String, default: null, trim: true },
    terms: { type: String, default: null, trim: true },

    pdfUrl: { type: String, default: null, trim: true, validate: [isURL, 'Invalid URL'] },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },

    ledgerEntryId: { type: Schema.Types.ObjectId, default: null },

    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },

    meta: { type: Schema.Types.Mixed, default: {} },

    // Backward-compat fields (to avoid breaking existing controllers)
    invoice_number: { type: String, trim: true, index: true },
    issue_date: { type: Date, index: true },
    due_date: { type: Date, index: true },
    tax_percentage: { type: Number, min: 0, max: 100, default: 0 },
    subtotal: { type: Number, min: 0, default: 0 },
    payment_status: { type: String, enum: ['pending','partially_paid','paid','overdue','cancelled'], default: 'pending', index: true },
    pdf_url: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    versionKey: false,
  }
);

InvoiceSchema.pre('validate', function (next) {
  const items = Array.isArray(this.items) ? this.items : [];
  const sub = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  this.subTotal = Math.round(sub);

  const taxSum = (Array.isArray(this.taxes) ? this.taxes : []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  this.total = Math.round(this.subTotal + taxSum);

  const paid = (Array.isArray(this.payments) ? this.payments : []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  this.paidAmount = Math.round(paid);
  this.balanceDue = Math.max(0, this.total - this.paidAmount);

  if (this.paidAmount >= this.total && this.total > 0) {
    this.status = 'paid';
    this.payment_status = 'paid';
    this.paidAt = this.paidAt || new Date();
  } else if (this.paidAmount > 0 && this.paidAmount < this.total) {
    this.status = 'partial';
    this.payment_status = 'partially_paid';
  } else if (this.status === 'draft' && this.issuedAt) {
    this.status = 'sent';
    this.payment_status = this.payment_status || 'pending';
  }

  // Keep backward fields synchronized
  this.subtotal = this.subTotal;
  this.issue_date = this.issuedAt || this.issue_date;
  this.due_date = this.dueDate || this.due_date;
  this.invoice_number = this.invoiceNo || this.invoice_number;
  this.pdf_url = this.pdfUrl || this.pdf_url;
  this.created_by = this.createdBy || this.created_by;
  next();
});

// Indexes
InvoiceSchema.index({ clientId: 1 });
InvoiceSchema.index({ projectId: 1 });
InvoiceSchema.index({ status: 1, dueDate: 1 });
InvoiceSchema.index({ created_by: 1, client: 1, issue_date: 1 });
InvoiceSchema.index({ due_date: 1, payment_status: 1 });

InvoiceSchema.methods.applyPayment = function (payment) {
  this.payments.push(payment);
  return this.save();
};

const Invoice = mongoose.model('Invoice', InvoiceSchema);
export default Invoice;
