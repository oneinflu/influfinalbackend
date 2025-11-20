// CollaboratorController: CRUD operations and filters for Collaborator model
// Exposes: list, getById, create, update, remove

import Collaborator from '../models/Collaborator.js';
import User from '../models/User.js';
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

const CollaboratorController = {
  // List collaborators with filters and search
  async list(req, res) {
    try {
      // Authorization: owners or team members with view_collaborator; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { type, status, managed_by, user, q } = req.query;
      const filter = {};
      if (type) filter.type = type;
      if (status) filter.status = status;

      let ownerScopeId = null;
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          ownerScopeId = new mongoose.Types.ObjectId(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_collaborator === true) ||
            assignedRole.permissions.view_collaborator === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_collaborator permission' });
          ownerScopeId = tm.managed_by;
        }
      }
      if (managed_by) {
        const oid = parseObjectId(managed_by);
        if (!oid) return res.status(400).json({ error: 'Invalid managed_by' });
        if (auth.type !== 'admin' && ownerScopeId && String(oid) !== String(ownerScopeId)) {
          return res.status(403).json({ error: 'Forbidden: managed_by out of scope' });
        }
        filter.managed_by = oid;
      } else if (auth.type !== 'admin' && ownerScopeId) {
        filter.managed_by = ownerScopeId;
      }
      if (user) {
        const oid = parseObjectId(user);
        if (!oid) return res.status(400).json({ error: 'Invalid user' });
        filter.users = oid;
      }
      if (q) {
        // q matches type or notes
        filter.$or = [{ type: { $regex: q, $options: 'i' } }, { notes: { $regex: q, $options: 'i' } }];
      }
      const items = await Collaborator.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get single collaborator
  async getById(req, res) {
    try {
      // Authorization: owners or team members with view_collaborator; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const doc = await Collaborator.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Collaborator not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          if (String(doc.managed_by) !== String(auth.id)) {
            return res.status(403).json({ error: 'Forbidden: collaborator not in owner scope' });
          }
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_collaborator === true) ||
            assignedRole.permissions.view_collaborator === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_collaborator permission' });
          if (String(doc.managed_by) !== String(tm.managed_by)) {
            return res.status(403).json({ error: 'Forbidden: collaborator not in scope' });
          }
        }
      }
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create collaborator (unique trio users+managed_by+type)
  async create(req, res) {
    try {
      // Authorization: owners or team members with create_collaborator; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body || {};
      // Accept either provided user id or auto-provision via user_email/user_name
      const baseRequired = ['type', 'managed_by'];
      for (const f of baseRequired) {
        if (!payload[f]) return res.status(400).json({ error: `${f} is required` });
      }
      let userOid = payload.users ? parseObjectId(payload.users) : null;
      if (!userOid && payload.user_email) {
        const emailLower = String(payload.user_email).toLowerCase();
        let userDoc = await User.findOne({ 'registration.email': emailLower }).lean();
        if (!userDoc) {
          const nameForUser = payload.user_name || emailLower.split('@')[0];
          const slug = await User.generateUniqueSlug(nameForUser || emailLower);
          const user = new User({
            registration: { email: emailLower, name: nameForUser, isOwner: false },
            profile: { slug },
          });
          await user.validate();
          userDoc = await user.save();
        } else {
          const update = {};
          if (!userDoc.registration?.name && payload.user_name) {
            update['registration.name'] = payload.user_name;
          }
          if (!userDoc.profile?.slug) {
            const nextSlug = await User.generateUniqueSlug(userDoc.registration?.name || payload.user_name || emailLower);
            update['profile.slug'] = nextSlug;
          }
          if (Object.keys(update).length > 0) {
            userDoc = await User.findByIdAndUpdate(userDoc._id, { $set: update }, { new: true, runValidators: true }).lean();
          }
        }
        userOid = userDoc._id;
      }
      if (!userOid) return res.status(400).json({ error: 'users or user_email is required' });
      const ownerOid = parseObjectId(payload.managed_by);
      if (!ownerOid) return res.status(400).json({ error: 'Invalid managed_by' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        let ownerScopeId = null;
        if (entity?.registration?.isOwner) {
          ownerScopeId = new mongoose.Types.ObjectId(auth.id);
          allowed = true;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasCreate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.create_collaborator === true) ||
              assignedRole.permissions.create_collaborator === true
            );
            allowed = !!hasCreate;
            ownerScopeId = tm.managed_by;
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing create_collaborator permission' });
        if (String(ownerOid) !== String(ownerScopeId)) {
          return res.status(403).json({ error: 'Forbidden: managed_by must be owner in scope' });
        }
      }
      payload.users = userOid;
      payload.managed_by = ownerOid;
      const doc = new Collaborator(payload);
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      // Handle unique index errors for trio
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate collaborator for users+managed_by+type' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Update collaborator
  async update(req, res) {
    try {
      // Authorization: owners or team members with update_collaborator; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const payload = req.body || {};
      const current = await Collaborator.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Collaborator not found' });
      let ownerScopeId = null;
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          ownerScopeId = auth.id;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasUpdate = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.update_collaborator === true) ||
            assignedRole.permissions.update_collaborator === true
          );
          if (!hasUpdate) return res.status(403).json({ error: 'Forbidden: missing update_collaborator permission' });
          ownerScopeId = tm.managed_by;
        }
        if (String(current.managed_by) !== String(ownerScopeId)) {
          return res.status(403).json({ error: 'Forbidden: collaborator not in scope' });
        }
        if (payload.managed_by) {
          const nextOwner = parseObjectId(payload.managed_by);
          if (!nextOwner) return res.status(400).json({ error: 'Invalid managed_by' });
          if (String(nextOwner) !== String(ownerScopeId)) {
            return res.status(403).json({ error: 'Forbidden: managed_by must be owner in scope' });
          }
        }
        if (payload.users) {
          const userOid = parseObjectId(payload.users);
          if (!userOid) return res.status(400).json({ error: 'Invalid users' });
          payload.users = userOid;
        }
      }
      const updated = await Collaborator.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Collaborator not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete collaborator
  async remove(req, res) {
    try {
      // Authorization: owners or team members with delete_collaborator; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const current = await Collaborator.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Collaborator not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let ownerScopeId = null;
        let hasDelete = false;
        if (entity?.registration?.isOwner) {
          ownerScopeId = auth.id;
          hasDelete = true;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          hasDelete = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.delete_collaborator === true) ||
            assignedRole.permissions.delete_collaborator === true
          );
          if (!hasDelete) return res.status(403).json({ error: 'Forbidden: missing delete_collaborator permission' });
          ownerScopeId = tm.managed_by;
        }
        if (String(current.managed_by) !== String(ownerScopeId)) {
          return res.status(403).json({ error: 'Forbidden: collaborator not in scope' });
        }
      }
      const removed = await Collaborator.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'Collaborator not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default CollaboratorController;