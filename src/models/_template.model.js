// TEMPLATE: Mongoose Model
// Use this template to define a new collection schema and model.
// Replace placeholders (ModelName, fields) with your actual definitions.

import mongoose from 'mongoose';

// Define the schema: fields, types, validation, defaults, indexes
// Each key becomes a column in MongoDB documents for this collection.
const ModelNameSchema = new mongoose.Schema(
  {
    // Example field: required string
    // name: { type: String, required: true, trim: true },

    // Add your fields here following the pattern above
  },
  {
    // Enable automatic createdAt/updatedAt timestamps
    timestamps: true,
    // Optional: control how documents convert to JSON
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Optional: add indexes for faster queries
// ModelNameSchema.index({ name: 1 }, { unique: true });

// Optional: add virtuals (computed fields not stored in DB)
// ModelNameSchema.virtual('displayName').get(function () {
//   return this.name.toUpperCase();
// });

// Optional: add pre/post hooks for lifecycle events
// ModelNameSchema.pre('save', function (next) { /* ... */ next(); });

// Export the model: change 'ModelName' to your actual model name
// The first argument sets the collection/model name; Mongoose pluralizes by default
const ModelName = mongoose.model('ModelName', ModelNameSchema);
export default ModelName;