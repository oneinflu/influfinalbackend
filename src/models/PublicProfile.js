// PublicProfile model: public-facing profile data for a User
// Implements your schema with refs, stats sub-docs, validation, indexes, and snake_case timestamps.

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

const SocialHandleSchema = new mongoose.Schema(
  {
    platform: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true, validate: [isURL, 'Invalid URL'] },
  },
  { _id: true }
);

const DisplayServiceSchema = new mongoose.Schema(
  {
    service_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    description: { type: String, default: null },
    starting_price: { type: Number, default: 0, min: 0 },
    show_price: { type: Boolean, default: true },
  },
  { _id: true }
);

const PublicProfileSchema = new mongoose.Schema(
  {
    ownerRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },

    profile: new mongoose.Schema(
      {
        shortBio: { type: String, default: '' },
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        role: { type: String, default: '' },
        locationAddress: { type: String, default: '' },
        websiteUrl: { type: String, default: '', trim: true, validate: [isURL, 'Invalid URL'] },
        socialHandles: { type: [SocialHandleSchema], default: [] },
        ctaPhoneEnabled: { type: Boolean, default: false },
        ctaPhoneLabel: { type: String, default: '' },
        ctaPhoneNumber: { type: String, default: '' },
        ctaEmailEnabled: { type: Boolean, default: false },
        ctaEmailLabel: { type: String, default: '' },
        ctaEmailAddress: { type: String, default: '' },
      },
      { _id: false }
    ),

    servicesSection: new mongoose.Schema(
      {
        services_section_enabled: { type: Boolean, default: true },
        services_section_title: { type: String, default: '' },
        services_section_subtitle: { type: String, default: '' },
        display_services: { type: [DisplayServiceSchema], default: [] },
        published_services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: [] }],
      },
      { _id: false }
    ),

    portfolioSection: new mongoose.Schema(
      {
        portfolio_section_enabled: { type: Boolean, default: true },
        portfolio_section_title: { type: String, default: '' },
        portfolio_section_subtitle: { type: String, default: '' },
        showcase_media: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', default: [] }],
      },
      { _id: false }
    ),

    collaboratorsSection: new mongoose.Schema(
      {
        collaborators_section_enabled: { type: Boolean, default: true },
        collaborators_section_title: { type: String, default: '' },
        collaborators_section_subtitle: { type: String, default: '' },
        published_collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collaborator', default: [] }],
      },
      { _id: false }
    ),

    brandsSection: new mongoose.Schema(
      {
        brands_section_enabled: { type: Boolean, default: true },
        brands_section_title: { type: String, default: '' },
        brands_section_subtitle: { type: String, default: '' },
        brand_images: [{ type: String, default: [], validate: [isURL, 'Invalid URL'] }],
      },
      { _id: false }
    ),

    ctaSection: new mongoose.Schema(
      {
        cta_section_enabled: { type: Boolean, default: true },
        cta_section_title: { type: String, default: '' },
        cta_section_subtext: { type: String, default: '' },
        cta_button_label: { type: String, default: '' },
      },
      { _id: false }
    ),

    linksSection: new mongoose.Schema(
      {
        terms_enabled: { type: Boolean, default: true },
        privacy_enabled: { type: Boolean, default: true },
        terms_text: { type: String, default: '' },
        privacy_text: { type: String, default: '' },
      },
      { _id: false }
    ),

    isPublished: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false }
);

PublicProfileSchema.index({ ownerRef: 1, slug: 1 }, { unique: true });

const PublicProfile = mongoose.model('PublicProfile', PublicProfileSchema);
export default PublicProfile;
