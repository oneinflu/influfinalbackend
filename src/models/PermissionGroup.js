// Permission Group model: groups of permissions with labels and defaults
// Implements your provided schema with validation, comments, and indexes.

import mongoose from 'mongoose';

// A single permission item within a group
const PermissionItemSchema = new mongoose.Schema(
  {
    // Machine-readable key used in code checks (e.g., create_invoice)
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9_\-]+$/, 'Invalid permission key'],
    },
    // Human-friendly label shown in UI (e.g., Create Invoice)
    label: { type: String, required: true, trim: true },
    // Description for clarity
    description: { type: String, trim: true },
    // Default grant state when assigned to a role/user
    default: { type: Boolean, default: false },
  },
  { _id: false }
);

// Main permission group schema
const PermissionGroupSchema = new mongoose.Schema(
  {
    // Group identifier (e.g., invoices, users); unique per collection
    group: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    // Display name (e.g., Invoice Management)
    name: { type: String, required: true, trim: true },

    // Group description
    description: { type: String, trim: true },

    // List of permissions belonging to this group
    permissions: { type: [PermissionItemSchema], default: [] },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure unique permission keys within the same group
PermissionGroupSchema.pre('validate', function ensureUniquePermissionKeys(next) {
  if (!Array.isArray(this.permissions)) return next();
  const seen = new Set();
  for (const p of this.permissions) {
    if (!p || !p.key) continue;
    const k = String(p.key).toLowerCase();
    if (seen.has(k)) {
      return next(new Error(`Duplicate permission key in group '${this.group}': ${k}`));
    }
    seen.add(k);
  }
  next();
});

// Index to support queries by permission key within groups
PermissionGroupSchema.index({ 'permissions.key': 1 });
PermissionGroupSchema.index({ group: 1 }, { unique: true });

// Export model
const PermissionGroup = mongoose.model('PermissionGroup', PermissionGroupSchema);
export default PermissionGroup;