import mongoose from 'mongoose';

const OtpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true, index: true },
    lastSentAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['sent', 'verified', 'expired'], default: 'sent', index: true },
    meta: {
      provider: { type: String, default: 'fast2sms' },
      route: { type: String, default: 'otp' },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

OtpSchema.index({ phone: 1, created_at: -1 });

const Otp = mongoose.model('Otp', OtpSchema);
export default Otp;

