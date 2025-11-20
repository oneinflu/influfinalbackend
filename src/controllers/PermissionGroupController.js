// PermissionGroupController: CRUD operations and filters for PermissionGroup model
// Exposes: list, getById, create, update, remove

import PermissionGroup from '../models/PermissionGroup.js';
import { getAuthFromRequest } from '../middleware/auth.js';

const PermissionGroupController = {
  // List permission groups with filters and search
  async list(req, res) {
    try {
      // Allow both admin and user, but require a valid authenticated principal
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { group, permission_key, q, from, to } = req.query;
      const filter = {};
      // Restrict user to only public groups
      if (auth.type === 'user') {
        filter.visibility = 'public';
      }
      if (group) filter.group = String(group).toLowerCase().trim();
      if (permission_key) filter['permissions.key'] = String(permission_key).toLowerCase().trim();
      if (from || to) {
        filter.created_at = {};
        if (from) filter.created_at.$gte = new Date(from);
        if (to) filter.created_at.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
        ];
      }
      const items = await PermissionGroup.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get one permission group
  async getById(req, res) {
    try {
      // Restrict to admin only
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const query = { _id: id };
      // Restrict user to only public groups
      if (auth.type === 'user') {
        Object.assign(query, { visibility: 'public' });
      }
      const doc = await PermissionGroup.findOne(query).lean();
      if (!doc) return res.status(404).json({ error: 'PermissionGroup not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create permission group
  async create(req, res) {
    try {
      // Admin-only: enforce via JWT auth without touching route wiring
      const auth = await getAuthFromRequest(req);
      if (!auth || auth.type !== 'admin') {
        return res.status(403).json({ error: 'Only admins can create permission groups' });
      }
      const payload = req.body || {};
      if (!payload.group) return res.status(400).json({ error: 'group is required' });
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      payload.group = String(payload.group).toLowerCase().trim();
      const doc = new PermissionGroup(payload);
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate group: must be unique' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Update permission group
  async update(req, res) {
    try {
      // Admin-only
      const auth = await getAuthFromRequest(req);
      if (!auth || auth.type !== 'admin') {
        return res.status(403).json({ error: 'Only admins can update permission groups' });
      }
      const { id } = req.params;
      const payload = req.body || {};
      if (payload.group) payload.group = String(payload.group).toLowerCase().trim();
      const updated = await PermissionGroup.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'PermissionGroup not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete permission group
  async remove(req, res) {
    try {
      // Admin-only
      const auth = await getAuthFromRequest(req);
      if (!auth || auth.type !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete permission groups' });
      }
      const { id } = req.params;
      const removed = await PermissionGroup.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'PermissionGroup not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default PermissionGroupController;