// Testimonial model: stores testimonial text, rating, and lifecycle
// Implements your schema with validation, indexes, and snake_case timestamps.

import mongoose from 'mongoose';

const TestimonialSchema = new mongoose.Schema(
  {
    // Testimonial content (free text)
    testimonials: { type: String, required: true, trim: true, maxlength: 2000 },

    // Rating scale 0-5 (integer)
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer',
      },
      index: true,
    },

    // Date when the testimonial was given
    given_on: { type: Date, index: true },

    // Lifecycle status
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  {
    timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Export model
const Testimonial = mongoose.model('Testimonial', TestimonialSchema);
export default Testimonial;