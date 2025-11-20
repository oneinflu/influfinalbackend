// Collaborator model: links a user to a manager with a collaboration type
// Matches your schema with validation, indexes, and snake_case timestamps.

import mongoose from 'mongoose';

const CollaboratorSchema = new mongoose.Schema(
  {
    // Collaboration type: influencer or model
    type: {
      type: String,
      enum: ['UGC creator','Editor', 'Scriptwriter', 'Voice-over artist','Model','Actor','Designer','Photographer','Videographer' ,'Influencer'],
      required: true,
      index: true,
    },

    // The user being collaborated (singular as per your schema key 'users')
    users: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // The manager/owner who manages this collaboration
    managed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Active/inactive lifecycle state
    status: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active', index: true },

    // Optional notes about the collaboration
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Prevent duplicate collaborations for the same user-manager-type trio
CollaboratorSchema.index({ users: 1, managed_by: 1, type: 1 }, { unique: true });
CollaboratorSchema.index({ managed_by: 1, status: 1 });

// Export model
const Collaborator = mongoose.model('Collaborator', CollaboratorSchema);
export default Collaborator;