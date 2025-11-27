import mongoose from 'mongoose';

const ServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    unit: { type: String, required: true, trim: true },
    defaultDeliverables: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ServiceSchema.pre('validate', function (next) {
  const dedupeStrings = (arr) => {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for (const v of arr) {
      if (typeof v !== 'string') continue;
      const t = v.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  };

  if (typeof this.name === 'string') this.name = this.name.trim();
  if (typeof this.category === 'string') this.category = this.category.trim();
  if (typeof this.unit === 'string') this.unit = this.unit.trim();
  this.defaultDeliverables = dedupeStrings(this.defaultDeliverables);
  this.tags = dedupeStrings(this.tags);
  next();
});

ServiceSchema.index(
  { name: 1, category: 1 },
  { unique: true, partialFilterExpression: { name: { $type: 'string' }, category: { $type: 'string' } } }
);
ServiceSchema.index({ category: 1 });

const Service = mongoose.model('Service', ServiceSchema);
export default Service;
