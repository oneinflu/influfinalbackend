// PublicProfileController: CRUD operations and filters for PublicProfile model
// Exposes: list, getById, create, update, remove

import PublicProfile from '../models/PublicProfile.js';
import User from '../models/User.js';
import { getAuthFromRequest } from '../middleware/auth.js';
import mongoose from 'mongoose';

function parseObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

const PublicProfileController = {
  async list(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { owner_ref, is_published, from, to, q } = req.query;
      const filter = {};
      if (auth.type !== 'admin') filter.ownerRef = new mongoose.Types.ObjectId(auth.id);
      if (owner_ref) {
        const oid = parseObjectId(owner_ref);
        if (!oid) return res.status(400).json({ error: 'Invalid owner_ref' });
        filter.ownerRef = oid;
      }
      if (is_published === 'true') filter.isPublished = true;
      else if (is_published === 'false') filter.isPublished = false;
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }
      if (q) filter.slug = { $regex: q, $options: 'i' };
      const items = await PublicProfile.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  async getBySlug(req, res) {
    try {
      const { slug } = req.params;
      const value = String(slug || '').trim().toLowerCase();
      if (!value) return res.status(400).json({ error: 'Invalid slug' });
      const doc = await PublicProfile.findOne({ slug: value }).lean();
      if (!doc) return res.status(404).json({ error: 'PublicProfile not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const doc = await PublicProfile.findById(oid).lean();
      if (!doc) return res.status(404).json({ error: 'PublicProfile not found' });
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
      const ownerRef = parseObjectId(payload.ownerRef);
      const slug = String(payload.slug || '').trim().toLowerCase();
      if (!ownerRef) return res.status(400).json({ error: 'Invalid ownerRef' });
      if (!slug) return res.status(400).json({ error: 'slug is required' });
      if (auth.type !== 'admin' && String(ownerRef) !== String(auth.id)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const dupeSlug = await PublicProfile.findOne({ slug }).select('_id').lean();
      if (dupeSlug) return res.status(409).json({ error: 'Duplicate slug' });

      const doc = new PublicProfile({
        ownerRef,
        slug,
        profile: payload.profile || {},
        servicesSection: payload.servicesSection || {},
        portfolioSection: payload.portfolioSection || {},
        collaboratorsSection: payload.collaboratorsSection || {},
        brandsSection: payload.brandsSection || {},
        ctaSection: payload.ctaSection || {},
        linksSection: payload.linksSection || {},
        isPublished: payload.isPublished !== undefined ? !!payload.isPublished : true,
        createdBy: new mongoose.Types.ObjectId(auth.id),
        updatedBy: null,
      });
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
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
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const current = await PublicProfile.findById(oid).select(['ownerRef']).lean();
      if (!current) return res.status(404).json({ error: 'PublicProfile not found' });
      if (auth.type !== 'admin' && String(current.ownerRef) !== String(auth.id)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const payload = req.body || {};
      const update = {};
      if (payload.slug) {
        const nextSlug = String(payload.slug).trim().toLowerCase();
        if (!nextSlug) return res.status(400).json({ error: 'Invalid slug' });
        const dupe = await PublicProfile.findOne({ _id: { $ne: oid }, slug: nextSlug }).select('_id').lean();
        if (dupe) return res.status(409).json({ error: 'Duplicate slug' });
        update.slug = nextSlug;
      }
      if (payload.profile !== undefined) update.profile = payload.profile || {};
      if (payload.servicesSection !== undefined) update.servicesSection = payload.servicesSection || {};
      if (payload.portfolioSection !== undefined) update.portfolioSection = payload.portfolioSection || {};
      if (payload.collaboratorsSection !== undefined) update.collaboratorsSection = payload.collaboratorsSection || {};
      if (payload.brandsSection !== undefined) update.brandsSection = payload.brandsSection || {};
      if (payload.ctaSection !== undefined) update.ctaSection = payload.ctaSection || {};
      if (payload.linksSection !== undefined) update.linksSection = payload.linksSection || {};
      if (payload.isPublished !== undefined) update.isPublished = !!payload.isPublished;
      update.updatedBy = new mongoose.Types.ObjectId(auth.id);
      const updated = await PublicProfile.findByIdAndUpdate(oid, { $set: update }, { new: true, runValidators: true }).lean();
      if (!updated) return res.status(404).json({ error: 'PublicProfile not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const current = await PublicProfile.findById(oid).select(['ownerRef']).lean();
      if (!current) return res.status(404).json({ error: 'PublicProfile not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(current.ownerRef) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasDelete = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.delete_profile === true) ||
              assignedRole.permissions.delete_profile === true
            );
            allowed = !!hasDelete && String(current.ownerRef) === String(tm.managed_by);
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      }

      const removed = await PublicProfile.findByIdAndDelete(oid).lean();
      if (!removed) return res.status(404).json({ error: 'PublicProfile not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  async publish(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const current = await PublicProfile.findById(oid).select(['ownerRef']).lean();
      if (!current) return res.status(404).json({ error: 'PublicProfile not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(current.ownerRef) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasUpdate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.update_profile === true) ||
              assignedRole.permissions.update_profile === true
            );
            allowed = !!hasUpdate && String(current.ownerRef) === String(tm.managed_by);
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      }
      const updated = await PublicProfile.findByIdAndUpdate(oid, { $set: { isPublished: true, publishedAt: new Date() } }, { new: true }).lean();
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  async unpublish(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const current = await PublicProfile.findById(oid).select(['ownerRef']).lean();
      if (!current) return res.status(404).json({ error: 'PublicProfile not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(current.ownerRef) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasUpdate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.update_profile === true) ||
              assignedRole.permissions.update_profile === true
            );
            allowed = !!hasUpdate && String(current.ownerRef) === String(tm.managed_by);
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      }
      const updated = await PublicProfile.findByIdAndUpdate(oid, { $set: { isPublished: false, publishedAt: null } }, { new: true }).lean();
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  async incrementView(req, res) {
    try {
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const { referrer } = req.body || {};
      const doc = await PublicProfile.findById(oid);
      if (!doc) return res.status(404).json({ error: 'PublicProfile not found' });
      await doc.incrementView({ referrer });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default PublicProfileController;
