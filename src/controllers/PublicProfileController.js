// PublicProfileController: CRUD operations and filters for PublicProfile model
// Exposes: list, getById, create, update, remove

import PublicProfile from '../models/PublicProfile.js';
import TeamMember from '../models/TeamMember.js';
import Role from '../models/Role.js';
import { getAuthFromRequest } from '../middleware/auth.js';
import mongoose from 'mongoose';
import { uploadImageBufferToCloudinary } from '../utils/cloudinary.js';

function parseObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

const PublicProfileController = {
  // List public profiles with filters and search
  async list(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const {
        user_id,
        has_cover_photo,
        min_rating,
        max_rating,
        has_stats,
        featured_client,
        showcase_media,
        from,
        to,
        q,
      } = req.query;

      const filter = {};
      // Scope by ownership for non-admins
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          filter.user_id = parseObjectId(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_profile === true) ||
            assignedRole.permissions.view_profile === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_profile permission' });
          filter.user_id = parseObjectId(tm.managed_by);
        }
        if (user_id) {
          const oid = parseObjectId(user_id);
          if (!oid) return res.status(400).json({ error: 'Invalid user_id' });
          if (String(oid) !== String(filter.user_id)) {
            return res.status(403).json({ error: 'Forbidden: user_id not in scope' });
          }
          filter.user_id = oid;
        }
      } else if (user_id) {
        const oid = parseObjectId(user_id);
        if (!oid) return res.status(400).json({ error: 'Invalid user_id' });
        filter.user_id = oid;
      }

      if (has_cover_photo === 'true') {
        filter.cover_photo = { $exists: true, $ne: '' };
      } else if (has_cover_photo === 'false') {
        filter.cover_photo = { $in: [null, ''] };
      }

      const ratingCond = {};
      if (min_rating !== undefined) {
        const v = parseFloat(min_rating);
        if (Number.isNaN(v)) return res.status(400).json({ error: 'Invalid min_rating' });
        ratingCond.$gte = v;
      }
      if (max_rating !== undefined) {
        const v = parseFloat(max_rating);
        if (Number.isNaN(v)) return res.status(400).json({ error: 'Invalid max_rating' });
        ratingCond.$lte = v;
      }
      if (Object.keys(ratingCond).length) {
        filter['stats.avg_rating'] = ratingCond;
      }

      if (has_stats === 'true') {
        filter['stats.0'] = { $exists: true };
      } else if (has_stats === 'false') {
        filter.stats = { $size: 0 };
      }

      if (featured_client) {
        const oid = parseObjectId(featured_client);
        if (!oid) return res.status(400).json({ error: 'Invalid featured_client' });
        filter.featured_clients = oid;
      }

      if (showcase_media) {
        const oid = parseObjectId(showcase_media);
        if (!oid) return res.status(400).json({ error: 'Invalid showcase_media' });
        filter.showcase_media = oid;
      }

      if (from || to) {
        filter.created_on = {};
        if (from) filter.created_on.$gte = new Date(from);
        if (to) filter.created_on.$lte = new Date(to);
      }

      if (q) {
        filter.bio = { $regex: q, $options: 'i' };
      }

      const items = await PublicProfile.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Upload and set cover photo for the current user's public profile
  async updateCoverPhoto(req, res) {
    try {
      const user = req.user;
      const id = user?._id || user?.id;
      if (!id) return res.status(401).json({ error: 'Unauthorized' });
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'cover file is required' });
      }
      // Upload to Cloudinary
      let uploadResult;
      try {
        uploadResult = await uploadImageBufferToCloudinary(req.file.buffer, { folder: process.env.CLOUDINARY_FOLDER || 'covers' });
      } catch (uploadErr) {
        return res.status(400).json({ error: `Cover upload failed: ${uploadErr?.message || uploadErr}` });
      }
      if (!uploadResult?.secure_url) {
        return res.status(400).json({ error: 'Upload failed' });
      }
      const coverUrl = uploadResult.secure_url;
      // Find or create public profile for this user
      const existing = await PublicProfile.findOne({ user_id: id }).select('_id').lean();
      let saved;
      if (existing && existing._id) {
        saved = await PublicProfile.findByIdAndUpdate(existing._id, { $set: { cover_photo: coverUrl } }, { new: true }).lean();
      } else {
        const doc = new PublicProfile({ user_id: id, cover_photo: coverUrl, stats: [], featured_clients: [], showcase_media: [] });
        await doc.validate();
        saved = await doc.save();
      }
      return res.json({ cover_photo: saved?.cover_photo || coverUrl });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get single public profile
  async getById(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const doc = await PublicProfile.findById(oid).lean();
      if (!doc) return res.status(404).json({ error: 'PublicProfile not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          if (String(doc.user_id) !== String(auth.id)) {
            return res.status(403).json({ error: 'Forbidden: profile not in owner scope' });
          }
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_profile === true) ||
            assignedRole.permissions.view_profile === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_profile permission' });
          if (String(doc.user_id) !== String(tm.managed_by)) {
            return res.status(403).json({ error: 'Forbidden: profile not in team scope' });
          }
        }
      }
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create public profile
  async create(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body || {};
      if (!payload.user_id) return res.status(400).json({ error: 'user_id is required' });
      const userOid = parseObjectId(payload.user_id);
      if (!userOid) return res.status(400).json({ error: 'Invalid user_id' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(userOid) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasCreate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.create_profile === true) ||
              assignedRole.permissions.create_profile === true
            );
            allowed = !!hasCreate && String(userOid) === String(tm.managed_by);
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing create_profile or wrong user scope' });
      }

      const exists = await PublicProfile.findOne({ user_id: userOid }).lean();
      if (exists) return res.status(409).json({ error: 'PublicProfile already exists for this user' });

      const doc = new PublicProfile({
        user_id: userOid,
        cover_photo: payload.cover_photo,
        stats: Array.isArray(payload.stats) ? payload.stats : [],
        featured_clients: Array.isArray(payload.featured_clients) ? payload.featured_clients : [],
        bio: payload.bio,
        showcase_media: Array.isArray(payload.showcase_media) ? payload.showcase_media : [],
      });

      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      // Handle duplicate key error explicitly
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate key: user_id must be unique' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Update public profile
  async update(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });

      const payload = req.body || {};

      // Ensure current document exists and is within scope
      const current = await PublicProfile.findById(oid).select('user_id').lean();
      if (!current) return res.status(404).json({ error: 'PublicProfile not found' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(current.user_id) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasUpdate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.update_profile === true) ||
              assignedRole.permissions.update_profile === true
            );
            allowed = !!hasUpdate && String(current.user_id) === String(tm.managed_by);
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing update_profile or wrong user scope' });
      }

      if (payload.user_id) {
        const nextUserOid = parseObjectId(payload.user_id);
        if (!nextUserOid) return res.status(400).json({ error: 'Invalid user_id' });
        const dup = await PublicProfile.findOne({ _id: { $ne: oid }, user_id: nextUserOid }).lean();
        if (dup) return res.status(409).json({ error: 'Another PublicProfile already exists for this user' });
        // Prevent moving to another owner/team out of scope
        if (auth.type !== 'admin') {
          const entity = auth.entity || {};
          if (entity?.registration?.isOwner) {
            if (String(nextUserOid) !== String(auth.id)) {
              return res.status(403).json({ error: 'Forbidden: cannot move profile to another owner' });
            }
          } else {
            const email = entity?.registration?.email;
            const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('managed_by').lean() : null;
            if (!tm || String(nextUserOid) !== String(tm.managed_by)) {
              return res.status(403).json({ error: 'Forbidden: cannot move profile outside team scope' });
            }
          }
        }
      }

      const updated = await PublicProfile.findByIdAndUpdate(
        oid,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'PublicProfile not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete public profile
  async remove(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const current = await PublicProfile.findById(oid).select('user_id').lean();
      if (!current) return res.status(404).json({ error: 'PublicProfile not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(current.user_id) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasDelete = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.delete_profile === true) ||
              assignedRole.permissions.delete_profile === true
            );
            allowed = !!hasDelete && String(current.user_id) === String(tm.managed_by);
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing delete_profile or wrong user scope' });
      }

      const removed = await PublicProfile.findByIdAndDelete(oid).lean();
      if (!removed) return res.status(404).json({ error: 'PublicProfile not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default PublicProfileController;