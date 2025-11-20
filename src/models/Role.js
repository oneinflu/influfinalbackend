// Role model: tenant-scoped roles with permission matrix and assigned users
// Allows each user (owner) to create their own roles and assign team members.

import mongoose from 'mongoose';

// Permission matrix: flexible object { [group]: { [key]: boolean } }
// We use Mixed for flexibility and add validations in hooks.
const PermissionMatrixSchema = new mongoose.Schema(
  {
    // Keep it flexible; structure validated in hooks
  },
  { _id: false, strict: false }
);

const RoleSchema = new mongoose.Schema(
  {
    // Human-readable role name (unique per owner)
    name: { type: String, required: true, trim: true },

    // Role description
    description: { type: String, trim: true },

    // Flexible permission matrix (groups -> keys -> booleans)
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Users assigned to this role (must belong to the same owner)
    assigned_users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],

    // Whether this is a system-provided role (global); system roles typically have no owner
    is_system_role: { type: Boolean, default: false, index: true },

    // Owner of the role (the account/user who created it)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Locked roles cannot be edited or deleted (e.g., Owner Admin)
    locked: { type: Boolean, default: false, index: true },

    // Optional link to the system role template this role was cloned from
    source_template: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Unique role name per owner account
RoleSchema.index({ name: 1, createdBy: 1 }, { unique: true });
RoleSchema.index({ createdBy: 1 });
RoleSchema.index({ is_system_role: 1 });

// Helper to ensure assigned_users are unique
function dedupeObjectIds(arr) {
  const seen = new Set();
  const result = [];
  for (const id of arr || []) {
    const s = String(id);
    if (!seen.has(s)) {
      seen.add(s);
      result.push(id);
    }
  }
  return result;
}

// Validate permission matrix values are booleans (when present)
function validatePermissionMatrix(permissions) {
  if (!permissions || typeof permissions !== 'object') return true;
  for (const group of Object.keys(permissions)) {
    const g = permissions[group];
    if (!g || typeof g !== 'object') continue;
    for (const key of Object.keys(g)) {
      const v = g[key];
      if (typeof v !== 'boolean') {
        return false;
      }
    }
  }
  return true;
}

// Ensure assigned users belong to the same owner
async function ensureUsersBelongToOwner(doc) {
  if (!doc || !doc.createdBy || !Array.isArray(doc.assigned_users) || doc.assigned_users.length === 0) return;
  const User = mongoose.model('User');
  const count = await User.countDocuments({
    _id: { $in: doc.assigned_users },
    'account.owner': doc.createdBy,
  });
  if (count !== doc.assigned_users.length) {
    throw new Error('All assigned users must belong to the role owner account');
  }
}

RoleSchema.pre('validate', function (next) {
  // Dedupe assigned users and validate permissions are boolean flags
  if (Array.isArray(this.assigned_users)) {
    this.assigned_users = dedupeObjectIds(this.assigned_users);
  }
  if (!validatePermissionMatrix(this.permissions)) {
    return next(new Error('Permission matrix values must be booleans'));
  }
  next();
});

RoleSchema.pre('save', async function (next) {
  try {
    await ensureUsersBelongToOwner(this);
    next();
  } catch (err) {
    next(err);
  }
});

RoleSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const doc = {
      createdBy: update.createdBy ?? (this.getQuery() ? this.getQuery().createdBy : undefined),
      assigned_users: update.assigned_users,
    };
    if (doc.assigned_users && doc.createdBy) {
      await ensureUsersBelongToOwner(doc);
    }
    next();
  } catch (err) {
    next(err);
  }
});

const Role = mongoose.model('Role', RoleSchema);
export default Role;