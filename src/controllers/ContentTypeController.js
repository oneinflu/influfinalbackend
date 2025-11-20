// ContentTypeController: CRUD and filters for ContentType model
// Exposes: list, getById, create, update, remove

import ContentType from '../models/ContentType.js';
import { getAuthFromRequest } from '../middleware/auth.js';

const ContentTypeController = {
  async list(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { status, q } = req.query;
      const filter = {};
      if (status) filter.status = status;
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
        ];
      }
      const items = await ContentType.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const doc = await ContentType.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'ContentType not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  async create(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || auth.type !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      const payload = req.body || {};
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      const doc = new ContentType({
        name: String(payload.name).trim(),
        description: payload.description,
        status: payload.status || 'active',
      });
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate name or slug' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || auth.type !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      const { id } = req.params;
      const payload = req.body || {};
      if (payload.name) payload.name = String(payload.name).trim();
      const updated = await ContentType.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'ContentType not found' });
      return res.json(updated);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate name or slug' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || auth.type !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      const { id } = req.params;
      const removed = await ContentType.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'ContentType not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default ContentTypeController;