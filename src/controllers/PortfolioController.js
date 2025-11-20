// PortfolioController: CRUD operations and filters for Portfolio model
// Exposes: list, getById, create, update, remove

import Portfolio from '../models/Portfolio.js';
import mongoose from 'mongoose';
import { deleteFromBunny } from '../utils/bunnyStorage.js';

function parseObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

const PortfolioController = {
  // List portfolio items with filters and search
  async list(req, res) {
    try {
      const { type, status, belongs_to, tag, from, to, q } = req.query;
      const filter = {};
      if (type) filter.type = type;
      if (status) filter.status = status;
      if (belongs_to) {
        const oid = parseObjectId(belongs_to);
        if (!oid) return res.status(400).json({ error: 'Invalid belongs_to' });
        filter.belongs_to = oid;
      }
      if (tag) filter.tags = String(tag).toLowerCase().trim();
      if (from || to) {
        filter.uploaded_on = {};
        if (from) filter.uploaded_on.$gte = new Date(from);
        if (to) filter.uploaded_on.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { title: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
        ];
      }
      const items = await Portfolio.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get one portfolio item
  async getById(req, res) {
    try {
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const doc = await Portfolio.findById(oid).lean();
      if (!doc) return res.status(404).json({ error: 'Portfolio item not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create portfolio item
  async create(req, res) {
    try {
      const payload = req.body || {};
      if (!payload.type) return res.status(400).json({ error: 'type is required' });
      if (!payload.belongs_to) return res.status(400).json({ error: 'belongs_to is required' });
      if (!payload.media_url) return res.status(400).json({ error: 'media_url is required' });
      const ownerOid = parseObjectId(payload.belongs_to);
      if (!ownerOid) return res.status(400).json({ error: 'Invalid belongs_to' });
      const doc = new Portfolio({
        type: payload.type,
        belongs_to: ownerOid,
        media_url: payload.media_url,
        thumbnail_url: payload.thumbnail_url,
        size_bytes: typeof payload.size_bytes === 'number' ? payload.size_bytes : 0,
        thumbnail_size_bytes: typeof payload.thumbnail_size_bytes === 'number' ? payload.thumbnail_size_bytes : 0,
        title: payload.title,
        description: payload.description,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        status: payload.status || 'active',
      });
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate media_url for this owner' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Update portfolio item
  async update(req, res) {
    try {
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const payload = req.body || {};
      // Load current doc to compare URLs and cleanly set only provided fields
      const current = await Portfolio.findById(oid).lean();
      if (!current) return res.status(404).json({ error: 'Portfolio item not found' });

      // Normalize belongs_to if provided
      if (payload.belongs_to) {
        const ownerOid = parseObjectId(payload.belongs_to);
        if (!ownerOid) return res.status(400).json({ error: 'Invalid belongs_to' });
        payload.belongs_to = ownerOid;
      }

      // Build $set with only defined values
      const toSet = {};
      for (const [k, v] of Object.entries(payload)) {
        if (typeof v !== 'undefined') toSet[k] = v;
      }

      const updated = await Portfolio.findByIdAndUpdate(
        oid,
        { $set: toSet },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Portfolio item not found' });

      // Best-effort deletion of old Bunny files if URLs changed
      const tryDelete = async (fileUrl) => {
        if (!fileUrl || typeof fileUrl !== 'string') return false;
        try {
          let pathname = '';
          try {
            const u = new URL(fileUrl);
            pathname = u.pathname || '';
          } catch {
            pathname = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
          }
          const parts = pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            const userId = parts[0];
            const filename = parts.slice(1).join('/');
            await deleteFromBunny(userId, filename);
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };

      if (typeof toSet.media_url !== 'undefined' && current.media_url && current.media_url !== toSet.media_url) {
        await tryDelete(current.media_url);
      }
      if (typeof toSet.thumbnail_url !== 'undefined' && current.thumbnail_url && current.thumbnail_url !== toSet.thumbnail_url) {
        await tryDelete(current.thumbnail_url);
      }

      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete portfolio item
  async remove(req, res) {
    try {
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const removed = await Portfolio.findByIdAndDelete(oid).lean();
      if (!removed) return res.status(404).json({ error: 'Portfolio item not found' });

      // Best-effort deletion of Bunny files (media and thumbnail)
      const bunnyResult = { media: false, thumbnail: false };
      const tryDelete = async (fileUrl) => {
        if (!fileUrl || typeof fileUrl !== 'string') return false;
        try {
          // Attempt to parse userId and filename from the URL path: /<userId>/<filename>
          let pathname = '';
          try {
            const u = new URL(fileUrl);
            pathname = u.pathname || '';
          } catch {
            // Fallback if not absolute URL: treat as path
            pathname = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
          }
          const parts = pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            const userId = parts[0];
            const filename = parts.slice(1).join('/');
            await deleteFromBunny(userId, filename);
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };

      bunnyResult.media = await tryDelete(removed.media_url);
      bunnyResult.thumbnail = await tryDelete(removed.thumbnail_url);

      return res.json({ ok: true, bunny: bunnyResult });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default PortfolioController;