// Admin model: administrative users with roles, status, and audit timestamps
// Implements your schema with validation, indexes, and clear comments.

import mongoose from 'mongoose';

// Reusable validators
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/; // E.164-like
function isURL(value) {
  if (!value) return true; // allow empty if not required
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Define the Admin schema
const AdminSchema = new mongoose.Schema(
  {
    // Full name of the admin
    name: { type: String, required: true, trim: true },

    // Login email: lowercased, trimmed, unique
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Invalid email address'],
    },

    // Password hash (store hashed/encoded passwords only, never plaintext)
    password: { type: String, required: true },

    // Contact phone number: unique, optional, validated
    phone: {
      type: String,
      trim: true,
      match: [PHONE_REGEX, 'Invalid phone number'],
    },

    // Avatar image URL for admin profile
    avatar: { type: String, trim: true },

    // Role determines privileges; default super-admin
    role: {
      type: String,
      enum: ['super-admin', 'admin', 'moderator'],
      default: 'super-admin',
    },

    // Account status for access control
    status: {
      type: String,
      enum: ['active', 'inactive', 'banned'],
      default: 'active',
    },

    // Timestamp of last successful login
    last_login: { type: Date },
  },
  {
    // Map timestamps to snake_case keys
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for lookups and uniqueness
AdminSchema.index({ email: 1 }, { unique: true });
AdminSchema.index({ phone: 1 }, { unique: true, sparse: true });
AdminSchema.index({ role: 1 });
AdminSchema.index({ status: 1 });

// Export the model
const Admin = mongoose.model('Admin', AdminSchema);
export default Admin;