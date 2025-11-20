// Category model: Implements hierarchical categories with optional parent
// Fields follow your provided schema with clear validation and indexes.

import mongoose from 'mongoose';

// Simple URL validator using the WHATWG URL parser


// Utility to generate a slug from a name when not explicitly provided
function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumerics with hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

// Define the Category schema
const CategorySchema = new mongoose.Schema(
  {
    // Human-readable category name
    name: { type: String, required: true, trim: true },

    // URL-friendly identifier; unique and lowercased
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    // Optional parent pointing to another Category (supports hierarchy)
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },

    // Optional image URL for the category
    image: { type: String,  trim: true },

    // Optional description text
    description: { type: String, trim: true },

    // Active flag to control visibility/usage
    is_active: { type: Boolean, default: true }
  },
  {
    // Map timestamps to snake_case names as requested
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure unique constraint on slug (redundant with field options but explicit here)
CategorySchema.index({ slug: 1 }, { unique: true });
// Helpful indexes for common queries
CategorySchema.index({ name: 1 });
CategorySchema.index({ parent: 1 });
CategorySchema.index({ is_active: 1 });

// Pre-save hook: if slug is missing, derive from name for convenience
CategorySchema.pre('save', function (next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name);
  }
  next();
});

// Export the model
const Category = mongoose.model('Category', CategorySchema);
export default Category;