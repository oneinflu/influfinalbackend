// UserController: CRUD operations and filters for User model
// Exposes: list, getById, create, update, remove

import User from '../models/User.js';
import PublicProfile from '../models/PublicProfile.js';
import TeamMember from '../models/TeamMember.js';
import Role from '../models/Role.js';
import { ensureOwnerRolesSeeded } from '../utils/roleSeeding.js';
import { getAuthFromRequest } from '../middleware/auth.js';
import { ensureUserFolder } from '../utils/bunnyStorage.js';
import { uploadImageBufferToCloudinary } from '../utils/cloudinary.js';

const UserController = {
  // Check slug availability
  async checkSlug(req, res) {
    try {
      const raw = String(req.query.slug || '').trim();
      if (!raw) return res.status(400).json({ error: 'slug is required' });
      const normalized = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._]/g, '').replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
      const valid = /^[a-z0-9._]+$/.test(normalized) && !/\.\./.test(normalized) && normalized.length > 0;
      if (!valid) {
        return res.status(200).json({ slug: normalized, available: false, valid: false, reason: 'Slug can contain only a-z, 0-9, period, underscore, and no consecutive periods.' });
      }
      const exists = await User.findOne({ 'profile.slug': normalized }).select('_id').lean();
      return res.json({ slug: normalized, available: !exists, valid: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
  // Authenticated current user
  async me(req, res) {
    try {
      const authUser = req.user;
      const id = authUser?._id || authUser?.id;
      if (!id) return res.status(401).json({ error: 'Unauthorized' });
      const doc = await User.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'User not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Update current user's avatar via Cloudinary upload
  async updateAvatar(req, res) {
    try {
      const authUser = req.user;
      const id = authUser?._id || authUser?.id;
      if (!id) return res.status(401).json({ error: 'Unauthorized' });

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'avatar file is required' });
      }
      const buffer = req.file.buffer;
      try {
        const result = await uploadImageBufferToCloudinary(buffer, { folder: process.env.CLOUDINARY_FOLDER || 'avatars' });
        if (!result?.secure_url) {
          return res.status(400).json({ error: 'Upload failed' });
        }
        const updated = await User.findByIdAndUpdate(
          id,
          { $set: { 'registration.avatar': result.secure_url } },
          { new: true }
        ).lean();
        if (!updated) return res.status(404).json({ error: 'User not found' });
        return res.json({ avatar: updated?.registration?.avatar || result.secure_url });
      } catch (uploadErr) {
        return res.status(400).json({ error: `Avatar upload failed: ${uploadErr?.message || uploadErr}` });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
  // List users with filters and text search
  async list(req, res) {
    try {
      const { primaryRole, status, email, phone, slug, q, from, to } = req.query;
      const filter = {};
      if (primaryRole) filter['registration.primaryRole'] = primaryRole;
      if (status) filter['meta.status'] = status;
      if (email) filter['registration.email'] = String(email).toLowerCase();
      if (phone) filter['registration.phone'] = phone;
      if (slug) filter['profile.slug'] = String(slug).toLowerCase();
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { 'registration.name': { $regex: q, $options: 'i' } },
          { 'registration.email': { $regex: q, $options: 'i' } },
          { 'registration.phone': { $regex: q, $options: 'i' } },
        ];
      }
      const items = await User.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get one user
  async getById(req, res) {
    try {
      const { id } = req.params;
      const doc = await User.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'User not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create user
  async create(req, res) {
    try {
      const payload = req.body || {};
      if (!payload.registration?.email) return res.status(400).json({ error: 'registration.email is required' });
      if (!payload.registration?.name) return res.status(400).json({ error: 'registration.name is required' });

      // Normalize email to lowercase
      payload.registration.email = String(payload.registration.email).toLowerCase();

      // Determine isOwner based on authentication context and invitation intent
      // - Self-registration (no auth): set isOwner = true
      // - Owner inviting collaborators: set isOwner = false
      // - Owner referring independents (referral): set isOwner = true
      // - Admin or other contexts: leave as provided/default
      try {
        const auth = await getAuthFromRequest(req);
        if (!auth) {
          // no auth -> self registration
          payload.registration.isOwner = true;
        } else if (auth.type === 'user' && auth.entity?.registration?.isOwner === true) {
          // owner authenticated -> distinguish collaborator vs referral
          const isReferral = (
            payload?.registration?.inviteType === 'referral' ||
            payload?.inviteType === 'referral' ||
            payload?.registration?.isReferral === true ||
            payload?.isReferral === true
          );
          payload.registration.isOwner = isReferral ? true : false;
          // Attribute invitation to the owner
          payload.registration.invitedBy = auth.id;
        }
      } catch (e) {
        // If auth checking fails due to config, proceed without blocking creation
        // Default behavior remains unless explicitly set in payload
      }

      const doc = new User(payload);
      await doc.validate();
      const saved = await doc.save();
      // Seed default roles for owners (locked Owner Admin + cloned system templates)
      if (saved?.registration?.isOwner === true) {
        try {
          await ensureOwnerRolesSeeded(saved._id);
        } catch (seedErr) {
          // Do not fail user creation because of seeding issues; log or ignore
        }

        // Ensure owner is also a TeamMember with 'Owner Admin' role under their own scope
        try {
          const existingTm = await TeamMember.findOne({ email: saved.registration.email, managed_by: saved._id }).lean();
          if (!existingTm) {
            const ownerAdmin = await Role.findOne({ createdBy: saved._id, name: 'Owner Admin' }).select('_id').lean();
            const tm = new TeamMember({
              name: saved.registration?.name || saved.registration?.email || 'Owner',
              email: saved.registration.email,
              phone: saved.registration?.phone,
              managed_by: saved._id,
              role: ownerAdmin?._id,
              status: 'active',
            });
            await tm.validate();
            await tm.save();
          }
        } catch (tmErr) {
          // Do not block owner creation due to team member errors; surface as warning
          // Optional: console.warn(tmErr);
        }

        let slug = saved?.profile?.slug;
        if (!slug) {
          const base = saved?.registration?.name || saved?.registration?.email || 'user';
          slug = await User.generateUniqueSlug(base);
          try {
            await User.findByIdAndUpdate(saved._id, { $set: { 'profile.slug': slug } }, { new: true, runValidators: true }).lean();
          } catch {}
        }
        try {
          const existingProfile = await PublicProfile.findOne({ ownerRef: saved._id }).select('_id').lean();
          if (!existingProfile) {
            const pp = new PublicProfile({
              ownerRef: saved._id,
              slug,
              profile: {},
              servicesSection: {},
              portfolioSection: {},
              collaboratorsSection: {},
              brandsSection: {},
              ctaSection: {},
              linksSection: {},
              isPublished: true,
              createdBy: saved._id,
              updatedBy: null,
            });
            await pp.validate();
            await pp.save();
          }
        } catch {}
      }
      // Ensure Bunny folder exists for this user (best-effort)
      try {
        await ensureUserFolder(String(saved._id));
      } catch (folderErr) {
        // non-blocking; ignore errors
      }
      return res.status(201).json(saved);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate key: email/phone/slug must be unique' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Update user
  async update(req, res) {
    try {
      const { id } = req.params;
      const payload = req.body || {};
      if (payload.registration?.email) {
        payload.registration.email = String(payload.registration.email).toLowerCase();
      }
      if (payload.profile?.slug) {
        const raw = String(payload.profile.slug);
        // Normalize/validate slug per model rules
        const normalized = raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._]/g, '').replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
        payload.profile.slug = normalized;
      }
      const updated = await User.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'User not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete user
  async remove(req, res) {
    try {
      const { id } = req.params;
      const removed = await User.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'User not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default UserController;
