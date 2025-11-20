// Client model: brands/individual clients hiring influencers or agencies
// Based on your provided schema with validation, comments, and indexes.

import mongoose from 'mongoose';

// Validators
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/; // E.164-like
const GSTIN_REGEX = /^[0-9A-Z]{15}$/; // Basic GSTIN format (India)
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/; // Basic PAN format (India)
function isURL(value) {
  if (!value) return true; // allow empty
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Social handle sub-schema
const SocialHandleSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ['Instagram', 'YouTube', 'Twitter', 'LinkedIn', 'Facebook', 'Other'],
      required: true,
      trim: true,
    },
    handle: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
    },
  },
  { _id: false }
);

// Point of contact sub-schema
const PointOfContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, match: [PHONE_REGEX, 'Invalid phone number'] },
    email: { type: String, trim: true, lowercase: true, match: [EMAIL_REGEX, 'Invalid email address'] },
  },
  { _id: false }
);

// Location sub-schema
const LocationSchema = new mongoose.Schema(
  {
    country: { type: String, trim: true },
    city: { type: String, trim: true },
    town: { type: String, trim: true },
    pincode: { type: String, trim: true, match: [/^\d{4,10}$/u, 'Invalid pincode'] },
  },
  { _id: false }
);

// Main Client schema
const ClientSchema = new mongoose.Schema(
  {
    // Logo image URL
    logo: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },

    // Registered business or client name
    business_name: { type: String, required: true, trim: true, index: true },

    // Industry (free-text).
    industry: { type: String, trim: true, index: true },

    // Client type (individual, company, agency, etc.)
    type: {
      type: String,
      enum: ['individual', 'company', 'organization', 'agency'],
      default: 'individual',
      index: true,
    },

    // Invoice type (consumer vs business)
    invoice_type: {
      type: String,
      enum: ['consumer', 'business'],
      default: 'consumer',
      index: true,
    },

    // Tax identifiers
    gst_number: { type: String, uppercase: true, match: [GSTIN_REGEX, 'Invalid GST number'] },
    pan_number: { type: String, uppercase: true, match: [PAN_REGEX, 'Invalid PAN number'] },

    // Location and address
    location: { type: LocationSchema, default: {} },
    address: { type: String, trim: true },

    // Social media handles
    social_handles: { type: [SocialHandleSchema], default: [] },

    // Primary point of contact
    point_of_contact: { type: PointOfContactSchema, default: {} },

    // Status lifecycle
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },

    // Associated platform user account (for login & permissions)
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true, index: true },

    // Owner who added/owns this client (for scoping and permissions)
    added_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
ClientSchema.index({ business_name: 1 });
ClientSchema.index({ industry: 1 });
ClientSchema.index({ type: 1 });
ClientSchema.index({ invoice_type: 1 });
ClientSchema.index({ status: 1 });
ClientSchema.index({ 'location.country': 1, 'location.city': 1 });
ClientSchema.index({ 'point_of_contact.email': 1 }, { sparse: true });
ClientSchema.index({ 'point_of_contact.phone': 1 }, { sparse: true });
ClientSchema.index({ added_by: 1 });

// Export model
const Client = mongoose.model('Client', ClientSchema);
export default Client;