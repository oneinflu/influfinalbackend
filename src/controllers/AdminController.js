// AdminController: CRUD operations and filters for Admin model
// Exposes: list, getById, create, update, remove

import Admin from '../models/Admin.js';
import { requireAdmin } from '../middleware/auth.js';

const AdminController = {
  // Current admin profile
  async me(req, res) {
    try {
      const admin = req.admin;
      const id = admin?._id || admin?.id;
      if (!id) return res.status(401).json({ error: 'Unauthorized' });
      const doc = await Admin.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Admin not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
  // List admins with filters and search
  async list(req, res) {
    try {
      const { role, status, email, phone, q, from, to } = req.query;
      const filter = {};
      if (role) filter.role = role;
      if (status) filter.status = status;
      if (email) filter.email = String(email).toLowerCase();
      if (phone) filter.phone = phone;
      if (from || to) {
        filter.created_at = {};
        if (from) filter.created_at.$gte = new Date(from);
        if (to) filter.created_at.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
        ];
      }
      const items = await Admin.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get one admin
  async getById(req, res) {
    try {
      const { id } = req.params;
      const doc = await Admin.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Admin not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create admin
  async create(req, res) {
    try {
      const payload = req.body || {};
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      if (!payload.email) return res.status(400).json({ error: 'email is required' });
      if (!payload.password) return res.status(400).json({ error: 'password is required' });
      payload.email = String(payload.email).toLowerCase();
      const doc = new Admin(payload);
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate key: email/phone must be unique' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Update admin
  async update(req, res) {
    try {
      const { id } = req.params;
      const payload = req.body || {};
      if (payload.email) payload.email = String(payload.email).toLowerCase();
      const updated = await Admin.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Admin not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete admin
  async remove(req, res) {
    try {
      const { id } = req.params;
      const removed = await Admin.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'Admin not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default AdminController;