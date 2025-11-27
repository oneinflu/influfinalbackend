import mongoose from 'mongoose';

const { Schema } = mongoose;

const AddonSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const QuotationSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    rateCardId: { type: Schema.Types.ObjectId, ref: 'RateCard', required: true },
    deliverables: { type: [String], default: [] },
    quantity: { type: Number, required: true, min: 1 },
    totalCost: { type: Number, required: true, min: 0 },
    taxes: { type: Schema.Types.Mixed, default: {} },
    paymentTerms: { type: String, default: null },
    validity: { type: Number, default: null },
    addOns: { type: [AddonSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

QuotationSchema.index({ clientId: 1 });
QuotationSchema.index({ serviceId: 1 });
QuotationSchema.index({ rateCardId: 1 });

QuotationSchema.pre('validate', function (next) {
  if (typeof this.totalCost === 'number') {
    this.totalCost = Math.round(this.totalCost);
  }
  if (Array.isArray(this.addOns)) {
    this.addOns = this.addOns.map((a) => ({ ...a, price: Math.round(Number(a.price)), name: String(a.name || '').trim() }));
  }
  next();
});

const Quotation = mongoose.model('Quotation', QuotationSchema);
export default Quotation;

