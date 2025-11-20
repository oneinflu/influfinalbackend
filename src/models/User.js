// User model: Implements the provided JSON schema using Mongoose
// This file defines the data structure, validation rules, and indexes.

import mongoose from 'mongoose';

// Reusable validators
// Basic email regex for common formats
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164-like phone number (optional leading +, 7-15 digits)
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;
// Validator for URL using the WHATWG URL parser
function isURL(value) {
  if (!value) return true; // allow empty if not required
  try {
    // Throws if invalid URL
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
// Slug helpers: allow only [a-z0-9._], no spaces, no hyphens, no consecutive periods
function normalizeSlug(str) {
  const lower = String(str).trim().toLowerCase();
  // Replace spaces with underscore
  let s = lower.replace(/\s+/g, '_');
  // Remove any character not in allowed set
  s = s.replace(/[^a-z0-9._]/g, '');
  // Collapse consecutive periods to a single period
  s = s.replace(/\.{2,}/g, '.');
  // Trim leading/trailing periods
  s = s.replace(/^\.+|\.+$/g, '');
  return s;
}

function isValidSlug(str) {
  if (!str || typeof str !== 'string') return false;
  const s = String(str).trim();
  // Must be lowercase letters, numbers, underscore, period only
  if (!/^[a-z0-9._]+$/.test(s)) return false;
  // No consecutive periods
  if (/\.\./.test(s)) return false;
  return true;
}
// Define the nested sub-schema for social handles in the profile
const SocialHandleSchema = new mongoose.Schema(
  {
    // Platform of the social account with allowed options
    platform: {
      type: String,
      enum: [
        'instagram',
        'youtube',
        'tiktok',
        'facebook',
        'x',
        'twitter',
        'linkedin',
        'other',
      ],
      required: true,
    },
    // Username or handle on the platform
    handle: { type: String, trim: true },
    // Full URL to the profile; validated via URL parser
    url: {
      type: String,
      validate: [isURL, 'Invalid URL'],
    },
    // Follower count with default 0
    followers: { type: Number, default: 0, min: 0 },
    // Engagement rate percentage (0-100)
    engagementRate: { type: Number, min: 0, max: 100 },
    // Timestamp of last sync (Date object)
    lastSyncedAt: { type: Date },
    // Whether this social account is verified
    verified: { type: Boolean, default: false },
  },
  { _id: false }
);

// Define the nested sub-schema for portfolio items
const PortfolioItemSchema = new mongoose.Schema(
  {
    // Type of portfolio entry
    type: {
      type: String,
      enum: ['image', 'video', 'pdf', 'link'],
      required: true,
    },
    // Human-readable title
    title: { type: String, trim: true },
    // Resource URL; validated via URL parser
    url: {
      type: String,
      validate: [isURL, 'Invalid URL'],
    },
    // Owner reference (User)
    belongsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Upload timestamp
    uploadedAt: { type: Date },
  },
  { _id: false }
);

// Define nested sub-schema for payment information entries
const PaymentInformationSchema = new mongoose.Schema(
  {
    // Payment method with allowed options
    method: {
      type: String,
      enum: ['upi', 'bank_transfer', 'payoneer', 'paypal', 'stripe', 'other'],
      required: true,
    },
    // Priority ordering for multiple methods (lower is higher priority)
    priority: { type: Number, default: 0, min: 0 },
    // UPI identifier (if method is UPI)
    upiId: { type: String, trim: true },
    // Nested bank details
    bank: {
      accountName: { type: String, trim: true },
      // Store as encrypted or hashed string per spec
      accountNumberHash: { type: String },
      ifsc: { type: String, trim: true },
    },
    // Verification flag for payment method
    isVerified: { type: Boolean, default: false },
    // Timestamp of last verification
    lastVerifiedAt: { type: Date },
  },
  { _id: false }
);

// Main User schema
const UserSchema = new mongoose.Schema(
  {
    // Registration section: identification and account creation details
    registration: {
      // Full name with trimming of whitespace
      name: { type: String, trim: true },
      // Country ISO2 code; default empty to allow later assignment
      country: { type: String, default: '' },
      // Email with normalization and uniqueness
      email: {
        type: String,
        lowercase: true,
        trim: true,
        required: true,
        match: [EMAIL_REGEX, 'Invalid email address'],
      },
      // Phone number, unique; validated to be E.164-like (optional +)
      phone: {
        type: String,
        trim: true,
        match: [PHONE_REGEX, 'Invalid phone number'],
      },
      // Password hash storage (never store plain text)
      passwordHash: { type: String },
      // User accepted ToS/Privacy terms
      acceptTerms: { type: Boolean, default: true },
      // Avatar image URL for profile picture
      avatar: {
        type: String,
        trim: true,
      },
      // Roles: list of all roles assigned to the user
      roles: [
        {
          type: String,
          enum: ['influencer', 'model', 'agency', 'manager', 'business','UGC creator','Editor', 'Scriptwriter', 'Voice-over artist','Actor','Designer','Photographer','Videographer'],
        },
      ],
      // Primary role used for default experience; indexed for quick lookup
      primaryRole: {
        type: String,
        enum: ['influencer', 'model', 'agency', 'manager', 'business','UGC creator','Editor', 'Scriptwriter', 'Voice-over artist','Actor','Designer','Photographer','Videographer'],
      },
      isOwner: { type: Boolean, default: false },
      // Invite code used during signup; unique and indexed
      inviteCode: { type: String },
      // Reference to the inviting user (nullable)
      invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },

    // Profile section: public-facing information and measurements
    profile: {
      // Unique slug for profile URLs; indexed unique
      slug: {
        type: String,
        trim: true,
        validate: [isValidSlug, 'Invalid slug'],
      }},
      // Short bio limited to ~300 characters
      shortBio: { type: String, maxlength: 300, trim: true },
      // Gender selection from allowed options
      gender: {
        type: String,
        enum: ['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'],
      },
      // Date of birth (Date object)
      dateOfBirth: { type: Date },
      // Categories referenced by ObjectId to Category collection
      categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      // Social handles: array of sub-documents
      socialHandles: [SocialHandleSchema],
      // Measurements with units and visibility controls
      measurements: {
        heightCm: { type: Number, min: 0 },
        weightKg: { type: Number, min: 0 },
        chestCm: { type: Number, min: 0 },
        waistCm: { type: Number, min: 0 },
        hipCm: { type: Number, min: 0 },
        units: { type: String, enum: ['metric', 'imperial'], default: 'metric' },
        visibility: { type: String, enum: ['public', 'private', 'team_only'], default: 'private' },
      },
      // Portfolio entries (images, videos, links)
      portfolio: [PortfolioItemSchema],
    

    // Business information details for business users
    businessInformation: {
      businessName: { type: String, trim: true },
      teamSize: { type: Number, min: 0 },
      website: { type: String, validate: [isURL, 'Invalid URL'] },
      isGstRegistered: { type: Boolean, default: false },
      // GSTIN pattern (India): 15 alphanumeric uppercase
      gstNumber: { type: String, match: [/^[0-9A-Z]{15}$/, 'Invalid GST number'] },
      // PAN patterns (India)
      businessPAN: { type: String, match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN'] },
      individualPAN: { type: String, match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN'] },
      // Business address fields
      businessAddress: {
        line1: { type: String, trim: true },
        line2: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        postalCode: { type: String, trim: true },
        country: { type: String, trim: true },
      },
    },

  
    paymentInformation: [PaymentInformationSchema],

    // Preferences controlling communication and privacy
    preferences: {
      contactByEmail: { type: Boolean, default: true },
      contactByPhone: { type: Boolean, default: true },
      showProfileToSearch: { type: Boolean, default: true },
      // Free-form object for custom notification settings
      notificationSettings: { type: mongoose.Schema.Types.Mixed },
    },

    // Verification state tracking for email/phone/KYC
    verification: {
      emailVerified: { type: Boolean, default: false },
      phoneVerified: { type: Boolean, default: false },
      kycStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    },

    // Meta information: status and activity timestamps
    meta: {
      status: { type: String, enum: ['active', 'inactive', 'banned', 'deleted'], default: 'active' },
      createdAt: { type: Date },
      updatedAt: { type: Date },
      lastLoginAt: { type: Date },
      deletedAt: { type: Date, default: null },
      // e.g., signup source such as web, google, facebook, inviter
      source: { type: String, trim: true },
    },

    // Audit references for who created/updated the record
    audit: {
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  },
  {
    // Enable automatic top-level timestamps (createdAt, updatedAt)
    timestamps: true,
    // Include virtuals when converting to JSON/Object
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for nested unique and search use-cases
// Unique email under registration
UserSchema.index({ 'registration.email': 1 }, { unique: true });
// Unique phone (sparse to allow multiple docs without phone set)
UserSchema.index({ 'registration.phone': 1 }, { unique: true, sparse: true });
// Unique slug in profile
UserSchema.index({ 'profile.slug': 1 }, { unique: true, sparse: true });
// Invite code unique (sparse to allow null)
UserSchema.index({ 'registration.inviteCode': 1 }, { unique: true, sparse: true });
// Primary role index for frequent filters
UserSchema.index({ 'registration.primaryRole': 1 });
// Display name index to support search and sorting
// Removed displayName indexing (deprecated)

// Hooks to synchronize meta timestamps with top-level timestamps
// On initial save, populate meta.createdAt/updatedAt based on the auto timestamps
UserSchema.pre('save', function (next) {
  const now = new Date();
  // Initialize createdAt if missing
  if (!this.meta) this.meta = {};
  if (!this.meta.createdAt) this.meta.createdAt = this.createdAt || now;
  // Auto-generate profile.slug when missing from registration.name or email
  if (this.profile && !this.profile.slug) {
    const source = (this.registration?.name || this.registration?.email || '').toString();
    const normalized = normalizeSlug(source);
    if (normalized) this.profile.slug = normalized;
  }
  // Normalize slug if provided
  if (this.profile && this.profile.slug) {
    this.profile.slug = normalizeSlug(this.profile.slug);
  }
  // Always refresh updatedAt
  this.meta.updatedAt = this.updatedAt || now;
  next();
});

// When updating via findOneAndUpdate, also update meta.updatedAt
UserSchema.pre('findOneAndUpdate', function (next) {
  // Ensure meta.updatedAt is set in the update document
  const update = this.getUpdate() || {};
  if (!update.$set) update.$set = {};
  update.$set['meta.updatedAt'] = new Date();
  // Normalize slug on update if present
  const nextSlug = update.$set['profile.slug'] || update['profile.slug'];
  if (typeof nextSlug === 'string') {
    const normalized = normalizeSlug(nextSlug);
    update.$set['profile.slug'] = normalized;
  }
  this.setUpdate(update);
  next();
});

// Export the model
// Static helper to generate a unique, valid slug based on a source string
UserSchema.statics.generateUniqueSlug = async function (source) {
  const baseRaw = (source || '').toString();
  let base = normalizeSlug(baseRaw);
  if (!base) base = 'user';
  let candidate = base;
  let counter = 1;
  // Try incremental suffixes, then fall back to random
  // Use underscore for suffix per allowed set rules
  // Limit attempts to avoid long loops
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await this.findOne({ 'profile.slug': candidate }).select('_id').lean();
    if (!exists) return candidate;
    candidate = `${base}_${counter}`;
    counter += 1;
    if (counter > 50) {
      const rand = Math.floor(Math.random() * 1000000);
      candidate = `${base}_${rand}`;
    }
  }
};

const User = mongoose.model('User', UserSchema);
export default User;