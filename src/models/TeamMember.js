// TeamMember model: team members managed under an owner account
// Separate from User model; links to owner (managed_by) and tenant-scoped Role

import mongoose from 'mongoose';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/; // E.164-like

const TeamMemberSchema = new mongoose.Schema(
  {
    // Basic identity
    name: { type: String, required: true, trim: true, index: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [EMAIL_REGEX, 'Invalid email address'],
      index: true,
      sparse: true,
    },
    phone: {
      type: String,
      trim: true,
      match: [PHONE_REGEX, 'Invalid phone number'],
      index: true,
      sparse: true,
    },
    dob: { type: Date },
    gender: {
      type: String,
      enum: ['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'],
    },

    // Store only hashed passwords, never plaintext
    passwordHash: { type: String },

    // Assigned role (must be created by the same owner)
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', index: true },

    // Lifecycle status
    status: { type: String, enum: ['active', 'inactive', 'banned'], default: 'active', index: true },
    last_login: { type: Date },

    // Owner account this team member is managed under
    managed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Uniqueness within owner scope: allow same email/phone across different owners
TeamMemberSchema.index({ email: 1, managed_by: 1 }, { unique: true, sparse: true });
TeamMemberSchema.index({ phone: 1, managed_by: 1 }, { unique: true, sparse: true });
TeamMemberSchema.index({ managed_by: 1, role: 1 });

// Ensure assigned role belongs to the same owner
async function ensureRoleBelongsToOwner(doc) {
  if (!doc || !doc.role || !doc.managed_by) return;
  const Role = mongoose.model('Role');
  const role = await Role.findById(doc.role).select('createdBy').lean();
  if (!role) throw new Error('Assigned role not found');
  if (String(role.createdBy) !== String(doc.managed_by)) {
    throw new Error('Assigned role must be created by the same owner (managed_by)');
  }
}

TeamMemberSchema.pre('save', async function (next) {
  try {
    await ensureRoleBelongsToOwner(this);
    next();
  } catch (err) {
    next(err);
  }
});

TeamMemberSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const doc = {
      role: update.role ?? (update.$set ? update.$set.role : undefined),
      managed_by: update.managed_by ?? (update.$set ? update.$set.managed_by : undefined),
    };
    if (doc.role && doc.managed_by) {
      await ensureRoleBelongsToOwner(doc);
    }
    next();
  } catch (err) {
    next(err);
  }
});

const TeamMember = mongoose.model('TeamMember', TeamMemberSchema);
export default TeamMember;