// Collaborator model: links a user to a manager with a collaboration type
// Matches your schema with validation, indexes, and snake_case timestamps.

import mongoose from 'mongoose';

function isURL(value) {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

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

    // Identity block
    identity: {
      full_name: { type: String, trim: true },
      display_name: { type: String, trim: true },
      gender: { type: String, enum: ['male', 'female', 'other'], default: undefined },
      dob: { type: Date },
      age: { type: Number, min: 0 },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      languages: { type: [String], default: [] },
      bio: { type: String, trim: true, maxlength: 2000 },
      profile_icon_url: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },
    },

    // Contact details
    contact: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      whatsapp: { type: String, trim: true },
    },

    // Category / skills selection
    category: {
      role: {
        type: String,
        enum: ['UGC creator','Editor','Scriptwriter','Voice-over artist','Model','Actor','Designer','Photographer','Videographer','Influencer'],
      },
      skills: { type: [String], default: [] },
      tools: { type: [String], default: [] },
    },

    // Social media / portfolio links
    socials: {
      instagram: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },
      youtube: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },
      tiktok: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },
      behance: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },
      dribbble: { type: String, trim: true, validate: [isURL, 'Invalid URL'] },
     
    },

    // Work preferences
    preferences: {
      work_mode: { type: String, enum: ['remote', 'on_site', 'hybrid'], default: undefined },
      preferred_types: { type: [String], default: [] },
      industries: { type: [String], default: [] },
    },

    // Experience level
    experience: {
      level: { type: String, enum: ['beginner', 'intermediate', 'expert'], default: undefined },
      years: { type: Number, min: 0 },
      previous_brand_work: { type: [String], default: [] },
    },

    // Sample work uploads (URLs)
    samples: {
      videos: { type: [String], default: [], validate: { validator: (arr) => arr.every(isURL), message: 'Invalid URL in videos' } },
      photos: { type: [String], default: [], validate: { validator: (arr) => arr.every(isURL), message: 'Invalid URL in photos' } },
      voice_samples: { type: [String], default: [], validate: { validator: (arr) => arr.every(isURL), message: 'Invalid URL in voice_samples' } },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure managed_by is an owner account
CollaboratorSchema.path('managed_by').validate({
  validator: async function (value) {
    try {
      const owner = await mongoose.model('User').findById(value).select('registration.isOwner').lean();
      return !!(owner && owner.registration && owner.registration.isOwner === true);
    } catch {
      return false;
    }
  },
  message: 'managed_by must reference an owner account',
});

// Normalize arrays and trim strings
CollaboratorSchema.pre('validate', function (next) {
  const dedupeStrings = (arr) => {
    if (!Array.isArray(arr)) return [];
    const set = new Set(
      arr
        .filter((v) => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    );
    return Array.from(set);
  };

  if (this.identity && Array.isArray(this.identity.languages)) {
    this.identity.languages = dedupeStrings(this.identity.languages);
  }
  if (this.category) {
    this.category.skills = dedupeStrings(this.category.skills);
    this.category.tools = dedupeStrings(this.category.tools);
  }
  if (this.preferences) {
    this.preferences.preferred_types = dedupeStrings(this.preferences.preferred_types);
    this.preferences.industries = dedupeStrings(this.preferences.industries);
  }
  if (this.experience && Array.isArray(this.experience.previous_brand_work)) {
    this.experience.previous_brand_work = dedupeStrings(this.experience.previous_brand_work);
  }
  next();
});

// Prevent duplicate collaborations for the same user-manager-type trio
CollaboratorSchema.index({ users: 1, managed_by: 1, type: 1 }, { unique: true });
CollaboratorSchema.index({ managed_by: 1, status: 1 });

// Export model
const Collaborator = mongoose.model('Collaborator', CollaboratorSchema);
export default Collaborator;
