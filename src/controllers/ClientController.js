// ClientController: CRUD operations and filters for Client model
// Exposes: list, getById, create, update, remove

import Client from '../models/Client.js';
import User from '../models/User.js';
import { ensureOwnerRolesSeeded } from '../utils/roleSeeding.js';
import { getAuthFromRequest } from '../middleware/auth.js';
import TeamMember from '../models/TeamMember.js';
import Role from '../models/Role.js';
import mongoose from 'mongoose';
import { uploadImageBufferToCloudinary } from '../utils/cloudinary.js';

const ClientController = {
  // List clients with filters and simple text search
  async list(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { type, industry, status, invoice_type, country, city, poc_email, poc_phone, q, user_id } = req.query;
      const filter = {};
      if (type) filter.type = type;
      if (industry) filter.industry = industry;
      if (status) filter.status = status;
      if (invoice_type) filter.invoice_type = invoice_type;
      if (country) filter['location.country'] = country;
      if (city) filter['location.city'] = city;
      if (poc_email) filter['point_of_contact.email'] = String(poc_email).toLowerCase();
      if (poc_phone) filter['point_of_contact.phone'] = poc_phone;
      if (q) filter.business_name = { $regex: q, $options: 'i' };

      // Scope: for non-admins, restrict to their owner scope
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let ownerScopeId = null;
        if (entity?.registration?.isOwner) {
          ownerScopeId = auth.id;
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_client === true) ||
            assignedRole.permissions.view_client === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_client permission' });
          ownerScopeId = tm.managed_by;
        }
        // Enforce scope by owner who added the client
        filter.added_by = ownerScopeId;
      } else if (user_id) {
        // Admins may filter by user_id
        const oid = (() => { try { return new mongoose.Types.ObjectId(user_id); } catch { return null; } })();
        if (!oid) return res.status(400).json({ error: 'Invalid user_id' });
        // Admin filter: either user_id (client-linked account) or added_by (owner)
        filter.$or = [{ user_id: oid }, { added_by: oid }];
      }

      const items = await Client.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get single client
  async getById(req, res) {
    try {
      const { id } = req.params;
      const doc = await Client.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Client not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create client
  async create(req, res) {
      try {
        // For multipart requests, fields may be under `data` string
        let payload = req.body || {};
        if (typeof req.body?.data === 'string') {
          try { payload = JSON.parse(req.body.data); } catch {}
        }
        // If a logo file is provided, upload to Cloudinary and set URL
        if (req.file && req.file.buffer) {
          try {
            const result = await uploadImageBufferToCloudinary(req.file.buffer, { folder: process.env.CLOUDINARY_FOLDER || 'clients' });
            if (result?.secure_url) {
              payload.logo = result.secure_url;
            }
          } catch (uploadErr) {
            return res.status(400).json({ error: `Logo upload failed: ${uploadErr?.message || uploadErr}` });
          }
        }
        if (!payload.business_name) {
          return res.status(400).json({ error: 'business_name is required' });
        }
        // Require email to create associated user for login
        if (!payload.point_of_contact?.email) {
          return res.status(400).json({ error: 'point_of_contact.email is required to create user login' });
        }
        // Normalize lowercase for email
        payload.point_of_contact.email = String(payload.point_of_contact.email).toLowerCase();

        // Create or link a User account for the client POC (no owner linkage here)
        const email = payload.point_of_contact.email;
        const pocName = payload.point_of_contact.name || '';
        const nameForUser = pocName || payload.business_name;
        let userDoc = await User.findOne({ 'registration.email': email }).lean();
        if (!userDoc) {
          const user = new User({
            registration: {
              email,
              name: nameForUser,
              roles: ['business'],
              primaryRole: 'business',
              isOwner: true,
            },
            profile: {
              // Slug must be based on the business name, not contact name
              slug: await User.generateUniqueSlug(payload.business_name || email),
            },
          });
          await user.validate();
          userDoc = await user.save();
        } else {
          // Ensure 'business' role is present
          const roles = Array.isArray(userDoc.registration?.roles) ? userDoc.registration.roles : [];
          const hasBusiness = roles.includes('business');
          const update = {};
          if (!hasBusiness) {
            update['registration.roles'] = [...roles, 'business'];
          }
          if (!userDoc.registration?.primaryRole) {
            update['registration.primaryRole'] = 'business';
          }
          // Ensure the client-linked user is an owner so they can add their own team
          if (userDoc.registration?.isOwner !== true) {
            update['registration.isOwner'] = true;
          }
          // Backfill name and slug if missing
          if (!userDoc.registration?.name && nameForUser) {
            update['registration.name'] = nameForUser;
          }
          if (!userDoc.profile?.slug) {
            // Backfill slug from business name (not contact name)
            const nextSlug = await User.generateUniqueSlug(payload.business_name || email);
            update['profile.slug'] = nextSlug;
          }
          if (Object.keys(update).length > 0) {
            userDoc = await User.findByIdAndUpdate(userDoc._id, { $set: update }, { new: true, runValidators: true }).lean();
          }
        }

        // Seed default roles if user is an owner
        if (userDoc?.registration?.isOwner === true) {
          try {
            await ensureOwnerRolesSeeded(userDoc._id);
          } catch (seedErr) {
            // ignore seeding errors; do not disrupt client creation
          }
        }

        // Link client to their POC user account
        payload.user_id = userDoc._id;

        // Attribute ownership to the current authenticated owner/team
        try {
          const auth = await getAuthFromRequest(req);
          if (auth && auth.type === 'user') {
            if (auth.entity?.registration?.isOwner) {
              payload.added_by = auth.id;
            } else {
              const emailAuth = auth.entity?.registration?.email;
              if (emailAuth) {
                const tm = await TeamMember.findOne({ email: emailAuth, status: 'active' }).select('managed_by').lean();
                if (tm && tm.managed_by) payload.added_by = tm.managed_by;
              }
            }
          }
        } catch {}

        const doc = new Client(payload);
        await doc.validate();
        const saved = await doc.save();
        return res.status(201).json(saved);
      } catch (err) {
        if (err && err.code === 11000) {
          // Handle duplicate email or unique user link violations
          return res.status(409).json({ error: 'Duplicate key: client or user already exists' });
        }
        return res.status(400).json({ error: err.message });
      }
  },

  // Update client
  async update(req, res) {
    try {
      const { id } = req.params;
      // For multipart requests, fields may be under `data` string
      let payload = req.body || {};
      if (typeof req.body?.data === 'string') {
        try { payload = JSON.parse(req.body.data); } catch {}
      }
      // If a logo file is provided, upload to Cloudinary and set URL
      if (req.file && req.file.buffer) {
        try {
          const result = await uploadImageBufferToCloudinary(req.file.buffer, { folder: process.env.CLOUDINARY_FOLDER || 'clients' });
          if (result?.secure_url) {
            payload.logo = result.secure_url;
          }
        } catch (uploadErr) {
          return res.status(400).json({ error: `Logo upload failed: ${uploadErr?.message || uploadErr}` });
        }
      }
      if (payload.point_of_contact?.email) {
        payload.point_of_contact.email = String(payload.point_of_contact.email).toLowerCase();
      }
      const updated = await Client.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Client not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete client
  async remove(req, res) {
    try {
      const { id } = req.params;
      const removed = await Client.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'Client not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default ClientController;
