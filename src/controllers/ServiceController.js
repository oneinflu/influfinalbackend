import Service from '../models/Service.js';
import { getAuthFromRequest } from '../middleware/auth.js';

const ServiceController = {
  async list(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { category, is_active, unit, tag, q, from, to } = req.query;
      const filter = {};
      if (category) filter.category = String(category).trim();
      if (unit) filter.unit = String(unit).trim();
      if (is_active === 'true') filter.isActive = true;
      else if (is_active === 'false') filter.isActive = false;
      if (tag) filter.tags = { $regex: String(tag), $options: 'i' };
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } },
        ];
      }
      const items = await Service.find(filter).lean();
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
      const doc = await Service.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Service not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  async create(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const payload = req.body || {};
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      if (!payload.category) return res.status(400).json({ error: 'category is required' });
      if (!payload.unit) return res.status(400).json({ error: 'unit is required' });
      const doc = new Service({
        name: String(payload.name).trim(),
        category: String(payload.category).trim(),
        description: payload.description ?? null,
        unit: String(payload.unit).trim(),
        defaultDeliverables: Array.isArray(payload.defaultDeliverables) ? payload.defaultDeliverables : [],
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        isActive: payload.isActive !== undefined ? !!payload.isActive : true,
      });
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate name+category' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { id } = req.params;
      const payload = req.body || {};
      if (payload.name) payload.name = String(payload.name).trim();
      if (payload.category) payload.category = String(payload.category).trim();
      if (payload.unit) payload.unit = String(payload.unit).trim();
      if (Array.isArray(payload.defaultDeliverables)) payload.defaultDeliverables = payload.defaultDeliverables.map((s) => String(s));
      if (Array.isArray(payload.tags)) payload.tags = payload.tags.map((s) => String(s));
      const updated = await Service.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Service not found' });
      return res.json(updated);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate name+category' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { id } = req.params;
      const removed = await Service.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'Service not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default ServiceController;
