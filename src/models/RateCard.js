import mongoose from 'mongoose';

const { Schema } = mongoose;

const AddonSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const RateCardSchema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    ownerType: { type: String, required: true, enum: ['collaborator', 'agency', 'agency_internal'] },
    ownerRef: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, trim: true, default: null },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', trim: true },
    deliveryDays: { type: Number, default: null },
    revisions: { type: Number, default: null },
    addons: { type: [AddonSchema], default: [] },
    visibility: { type: String, enum: ['public', 'private', 'internal'], default: 'public' },
    isActive: { type: Boolean, default: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    notes: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

RateCardSchema.index({ serviceId: 1 });
RateCardSchema.index({ ownerType: 1, ownerRef: 1 });
RateCardSchema.index({ visibility: 1, isActive: 1 });
RateCardSchema.index({ 'meta.collaboratorRef': 1 });

RateCardSchema.statics.findPublicByService = function (serviceId) {
  return this.find({ serviceId, visibility: 'public', isActive: true }).lean();
};

RateCardSchema.pre('validate', function (next) {
  if (typeof this.price === 'number') {
    this.price = Math.round(this.price);
  }
  if (Array.isArray(this.addons)) {
    this.addons = this.addons.map((a) => ({ ...a, price: Math.round(a.price), name: String(a.name || '').trim() }));
  }
  next();
});

const RateCard = mongoose.model('RateCard', RateCardSchema);
export default RateCard;

