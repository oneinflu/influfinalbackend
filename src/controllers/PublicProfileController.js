// PublicProfileController: CRUD operations and filters for PublicProfile model
// Exposes: list, getById, create, update, remove

import PublicProfile from '../models/PublicProfile.js';
import TeamMember from '../models/TeamMember.js';
import Role from '../models/Role.js';
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
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { owner_type, owner_ref, visibility, is_published, from, to, q } = req.query;
      const filter = {};
      if (owner_type) filter.ownerType = String(owner_type);
      if (owner_ref) {
        const oid = parseObjectId(owner_ref);
        if (!oid) return res.status(400).json({ error: 'Invalid owner_ref' });
        filter.ownerRef = oid;
      }
      if (visibility) filter.visibility = String(visibility);
      if (is_published === 'true') filter.isPublished = true;
      else if (is_published === 'false') filter.isPublished = false;
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { title: { $regex: q, $options: 'i' } },
          { shortBio: { $regex: q, $options: 'i' } },
          { slug: { $regex: q, $options: 'i' } },
        ];
      }
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          filter.ownerRef = parseObjectId(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_profile === true) ||
            assignedRole.permissions.view_profile === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_profile permission' });
          filter.ownerRef = tm.managed_by;
        }
      }
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
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body || {};
      const ownerType = String(payload.ownerType || '').trim();
      const ownerRef = parseObjectId(payload.ownerRef);
      const slug = String(payload.slug || '').trim().toLowerCase();
      if (!ownerType || !['user', 'collaborator', 'agency', 'influencer'].includes(ownerType)) {
        return res.status(400).json({ error: 'Invalid ownerType' });
      }
      if (!ownerRef) return res.status(400).json({ error: 'Invalid ownerRef' });
      if (!slug) return res.status(400).json({ error: 'slug is required' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(ownerRef) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasCreate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.create_profile === true) ||
              assignedRole.permissions.create_profile === true
            );
            allowed = !!hasCreate && String(ownerRef) === String(tm.managed_by);
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      }

      const dupeSlug = await PublicProfile.findOne({ slug }).select('_id').lean();
      if (dupeSlug) return res.status(409).json({ error: 'Duplicate slug' });

      const doc = new PublicProfile({
        ownerType,
        ownerRef,
        slug,
        visibility: String(payload.visibility || 'public'),
        mode: String(payload.mode || 'live'),
        title: payload.title ?? null,
        shortBio: payload.shortBio ?? null,
        heroImage: payload.heroImage ?? null,
        coverImage: payload.coverImage ?? null,
        location: payload.location ?? null,
        skills: Array.isArray(payload.skills) ? payload.skills : [],
        topServices: Array.isArray(payload.topServices) ? payload.topServices : [],
        portfolio: Array.isArray(payload.portfolio) ? payload.portfolio : [],
        gallery: Array.isArray(payload.gallery) ? payload.gallery : [],
        allowContact: payload.allowContact !== undefined ? !!payload.allowContact : true,
        showEmail: !!payload.showEmail,
        showPhone: !!payload.showPhone,
        contactEmail: payload.contactEmail ?? null,
        contactPhone: payload.contactPhone ?? null,
        ctas: Array.isArray(payload.ctas) ? payload.ctas : [],
        seo: payload.seo || {},
        customDomain: payload.customDomain ?? null,
        isPublished: !!payload.isPublished,
        publishedAt: payload.isPublished ? new Date() : null,
        expiresAt: payload.expiresAt ?? null,
        allowEmbed: !!payload.allowEmbed,
        embedCode: payload.embedCode ?? null,
        analytics: {},
        shareCount: 0,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        notes: payload.notes ?? null,
        meta: payload.meta || {},
        createdBy: auth.type === 'admin' ? new mongoose.Types.ObjectId(auth.id) : new mongoose.Types.ObjectId(auth.id),
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
      const payload = req.body || {};
      const update = {};
      if (payload.slug) {
        const nextSlug = String(payload.slug).trim().toLowerCase();
        if (!nextSlug) return res.status(400).json({ error: 'Invalid slug' });
        const dupe = await PublicProfile.findOne({ _id: { $ne: oid }, slug: nextSlug }).select('_id').lean();
        if (dupe) return res.status(409).json({ error: 'Duplicate slug' });
        update.slug = nextSlug;
      }
      if (payload.visibility) update.visibility = String(payload.visibility);
      if (payload.mode) update.mode = String(payload.mode);
      if (payload.title !== undefined) update.title = payload.title ?? null;
      if (payload.shortBio !== undefined) update.shortBio = payload.shortBio ?? null;
      if (payload.heroImage !== undefined) update.heroImage = payload.heroImage ?? null;
      if (payload.coverImage !== undefined) update.coverImage = payload.coverImage ?? null;
      if (payload.location !== undefined) update.location = payload.location ?? null;
      if (Array.isArray(payload.skills)) update.skills = payload.skills;
      if (Array.isArray(payload.topServices)) update.topServices = payload.topServices;
      if (Array.isArray(payload.portfolio)) update.portfolio = payload.portfolio;
      if (Array.isArray(payload.gallery)) update.gallery = payload.gallery;
      if (payload.allowContact !== undefined) update.allowContact = !!payload.allowContact;
      if (payload.showEmail !== undefined) update.showEmail = !!payload.showEmail;
      if (payload.showPhone !== undefined) update.showPhone = !!payload.showPhone;
      if (payload.contactEmail !== undefined) update.contactEmail = payload.contactEmail ?? null;
      if (payload.contactPhone !== undefined) update.contactPhone = payload.contactPhone ?? null;
      if (Array.isArray(payload.ctas)) update.ctas = payload.ctas;
      if (payload.seo !== undefined) update.seo = payload.seo || {};
      if (payload.customDomain !== undefined) update.customDomain = payload.customDomain ?? null;
      if (payload.expiresAt !== undefined) update.expiresAt = payload.expiresAt ?? null;
      if (payload.allowEmbed !== undefined) update.allowEmbed = !!payload.allowEmbed;
      if (payload.embedCode !== undefined) update.embedCode = payload.embedCode ?? null;
      if (payload.tags !== undefined) update.tags = Array.isArray(payload.tags) ? payload.tags : [];
      if (payload.notes !== undefined) update.notes = payload.notes ?? null;
      if (payload.meta !== undefined) update.meta = payload.meta || {};
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
