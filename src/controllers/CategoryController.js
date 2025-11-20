// CategoryController: CRUD operations and filters for Category model
// Exposes: list, getById, create, update, remove

import Category from '../models/Category.js';
import { getAuthFromRequest } from '../middleware/auth.js';
import mongoose from 'mongoose';

function parseObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

const CategoryController = {
  // List categories with filters
  async list(req, res) {
    try {
      // Require any authenticated principal (admin or user)
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { parent, is_active, slug, q, from, to } = req.query;
      const filter = {};
      if (parent) {
        const oid = parseObjectId(parent);
        if (!oid) return res.status(400).json({ error: 'Invalid parent' });
        filter.parent = oid;
      }
      if (is_active === 'true') filter.is_active = true;
      else if (is_active === 'false') filter.is_active = false;
      if (slug) filter.slug = String(slug).toLowerCase().trim();
      if (from || to) {
        filter.created_at = {};
        if (from) filter.created_at.$gte = new Date(from);
        if (to) filter.created_at.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { slug: { $regex: q, $options: 'i' } },
        ];
      }
      const items = await Category.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get one category
  async getById(req, res) {
    try {
      // Admin-only access to single category details
      const auth = await getAuthFromRequest(req);
       if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const doc = await Category.findById(oid).lean();
      if (!doc) return res.status(404).json({ error: 'Category not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create category
  async create(req, res) {
    try {
      // Admin-only creation
      const auth = await getAuthFromRequest(req);
      if (!auth || auth.type !== 'admin') {
        return res.status(403).json({ error: 'Only admins can create categories' });
      }
      const payload = req.body || {};
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      // Normalize slug when provided
      if (payload.slug) payload.slug = String(payload.slug).toLowerCase().trim();
      // Parent validation
      if (payload.parent) {
        const oid = parseObjectId(payload.parent);
        if (!oid) return res.status(400).json({ error: 'Invalid parent' });
        payload.parent = oid;
      }
      const doc = new Category(payload);
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate slug: must be unique' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Update category
  async update(req, res) {
    try {
      // Admin-only update
      const auth = await getAuthFromRequest(req);
      if (!auth || auth.type !== 'admin') {
        return res.status(403).json({ error: 'Only admins can update categories' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const payload = req.body || {};
      if (payload.slug) payload.slug = String(payload.slug).toLowerCase().trim();
      if (payload.parent) {
        const poid = parseObjectId(payload.parent);
        if (!poid) return res.status(400).json({ error: 'Invalid parent' });
        payload.parent = poid;
      }
      const updated = await Category.findByIdAndUpdate(
        oid,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Category not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete category
  async remove(req, res) {
    try {
      // Admin-only delete
      const auth = await getAuthFromRequest(req);
      if (!auth || auth.type !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete categories' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const removed = await Category.findByIdAndDelete(oid).lean();
      if (!removed) return res.status(404).json({ error: 'Category not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default CategoryController;