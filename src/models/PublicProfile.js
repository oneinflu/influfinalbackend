// PublicProfile model: public-facing profile data for a User
// Implements your schema with refs, stats sub-docs, validation, indexes, and snake_case timestamps.

import mongoose from 'mongoose';

const { Schema } = mongoose;

const CTAButtonSchema = new Schema(
  {
    label: { type: String, required: true },
    type: { type: String, enum: ['link', 'mailto', 'tel', 'modal', 'leadform'], default: 'link' },
    value: { type: String, required: true },
    showWhen: { type: String, enum: ['always', 'on_mobile', 'on_desktop'], default: 'always' },
  },
  { _id: false }
);

const ShareAnalyticsSchema = new Schema(
  {
    views: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null },
    referrers: { type: [String], default: [] },
  },
  { _id: false }
);

const LegacyStatsSchema = new Schema(
  {
    clients: { type: Number, min: 0, default: 0 },
    team_members: { type: Number, min: 0, default: 0 },
    projects: { type: Number, min: 0, default: 0 },
    years_in_business: { type: String, trim: true, default: '' },
    avg_rating: { type: Number, min: 0, max: 5, default: 0 },
  },
  { _id: false }
);

const PublicProfileSchema = new Schema(
  {
    ownerType: { type: String, required: true, enum: ['user', 'collaborator', 'agency', 'influencer'] },
    ownerRef: { type: Schema.Types.ObjectId, required: true },

    slug: { type: String, required: true },
    token: { type: String, default: null },

    visibility: { type: String, enum: ['public', 'unlisted', 'password_protected', 'private'], default: 'public' },
    passwordHash: { type: String, default: null },

    mode: { type: String, enum: ['live', 'snapshot'], default: 'live' },

    title: { type: String, default: null },
    shortBio: { type: String, default: null },
    heroImage: { type: String, default: null },
    coverImage: { type: String, default: null },
    location: { type: String, default: null },
    skills: { type: [String], default: [] },
    topServices: [
      {
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
        serviceName: { type: String, default: null },
        rateCardRef: { type: Schema.Types.ObjectId, ref: 'RateCard', default: null },
        price: { type: Number, default: 0 },
      },
    ],

    portfolio: { type: [String], default: [] },
    gallery: { type: [String], default: [] },

    allowContact: { type: Boolean, default: true },
    showEmail: { type: Boolean, default: false },
    showPhone: { type: Boolean, default: false },
    contactEmail: { type: String, default: null },
    contactPhone: { type: String, default: null },

    ctas: { type: [CTAButtonSchema], default: [] },

    seo: {
      metaTitle: { type: String, default: null },
      metaDescription: { type: String, default: null },
      ogImage: { type: String, default: null },
      canonicalUrl: { type: String, default: null },
    },

    customDomain: { type: String, default: null },

    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    allowEmbed: { type: Boolean, default: false },
    embedCode: { type: String, default: null },

    analytics: { type: ShareAnalyticsSchema, default: () => ({}) },
    shareCount: { type: Number, default: 0 },

    tags: { type: [String], default: [] },
    notes: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },

    createdBy: { type: Schema.Types.ObjectId, required: true },
    updatedBy: { type: Schema.Types.ObjectId, default: null },

    user_id: { type: Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    cover_photo: { type: String, trim: true, default: null },
    stats: { type: [LegacyStatsSchema], default: [] },
    featured_clients: [{ type: Schema.Types.ObjectId, ref: 'Client', default: [] }],
    published_services: [{ type: Schema.Types.ObjectId, ref: 'Service', default: [] }],
    published_projects: [{ type: Schema.Types.ObjectId, ref: 'Project', default: [] }],
    bio: { type: String, trim: true, default: null },
    showcase_media: [{ type: Schema.Types.ObjectId, ref: 'Portfolio', default: [] }],
  },
  { timestamps: true, versionKey: false }
);

PublicProfileSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $exists: true } } }
);
PublicProfileSchema.index({ ownerType: 1, ownerRef: 1 });
PublicProfileSchema.index({ visibility: 1, isPublished: 1 });
PublicProfileSchema.index({ publishedAt: 1, expiresAt: 1 });

PublicProfileSchema.pre('validate', function (next) {
  if (this.slug) {
    this.slug = String(this.slug).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  }
  next();
});

PublicProfileSchema.methods.incrementView = async function ({ referrer } = {}) {
  this.analytics.views = (this.analytics.views || 0) + 1;
  this.analytics.lastViewedAt = new Date();
  if (referrer) {
    this.analytics.referrers = (this.analytics.referrers || []).slice(0, 9);
    this.analytics.referrers.unshift(referrer);
  }
  await this.save();
};

const PublicProfile = mongoose.model('PublicProfile', PublicProfileSchema);
export default PublicProfile;
