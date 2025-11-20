// TestimonialController: CRUD operations and filters for Testimonial model
// Exposes: list, getById, create, update, remove

import Testimonial from '../models/Testimonial.js';

const TestimonialController = {
  // List testimonials with filters
  async list(req, res) {
    try {
      const { status, min_rating, max_rating, from, to, q } = req.query;
      const filter = {};
      if (status) filter.status = status;
      if (min_rating != null || max_rating != null) {
        filter.rating = {};
        if (min_rating != null) filter.rating.$gte = Number(min_rating);
        if (max_rating != null) filter.rating.$lte = Number(max_rating);
      }
      if (from || to) {
        filter.given_on = {};
        if (from) filter.given_on.$gte = new Date(from);
        if (to) filter.given_on.$lte = new Date(to);
      }
      if (q) filter.testimonials = { $regex: q, $options: 'i' };
      const items = await Testimonial.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get single testimonial
  async getById(req, res) {
    try {
      const { id } = req.params;
      const doc = await Testimonial.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Testimonial not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create testimonial
  async create(req, res) {
    try {
      const payload = req.body || {};
      if (!payload.testimonials) return res.status(400).json({ error: 'testimonials is required' });
      const doc = new Testimonial(payload);
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Update testimonial
  async update(req, res) {
    try {
      const { id } = req.params;
      const payload = req.body || {};
      const updated = await Testimonial.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Testimonial not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete testimonial
  async remove(req, res) {
    try {
      const { id } = req.params;
      const removed = await Testimonial.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'Testimonial not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default TestimonialController;