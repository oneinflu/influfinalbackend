// TeamMemberController: CRUD operations and filters with role-owner checks
// Exposes: list, getById, create, update, remove

import TeamMember from '../models/TeamMember.js';
import Role from '../models/Role.js';
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

const TeamMemberController = {
  // List team members with filters and search
  async list(req, res) {
    try {
      const { managed_by, role, status, q } = req.query;
      const filter = {};
      // Authorization: owners or team members with view_team; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      async function hasPermissionKeys(permissions, keys = []) {
        if (!permissions || typeof permissions !== 'object') return false;
        for (const group of Object.keys(permissions)) {
          const g = permissions[group];
          if (!g || typeof g !== 'object') continue;
          for (const key of keys) {
            if (g[key] === true) return true;
          }
        }
        for (const key of keys) {
          if (permissions[key] === true) return true;
        }
        return false;
      }

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let ownerScope = null;
        if (entity?.registration?.isOwner) {
          ownerScope = parseObjectId(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const requestedOwner = managed_by ? parseObjectId(managed_by) : null;
          const tmFilter = { email, status: 'active' };
          if (requestedOwner) tmFilter.managed_by = requestedOwner;
          const tm = await TeamMember.findOne(tmFilter).select('role managed_by').lean();
          if (!tm || !tm.role) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          if (!assignedRole || !hasPermissionKeys(assignedRole.permissions, ['view_team'])) {
            return res.status(403).json({ error: 'Forbidden: requires view_team permission' });
          }
          ownerScope = tm.managed_by;
        }
        filter.managed_by = ownerScope;
        if (managed_by) {
          const reqOwner = parseObjectId(managed_by);
          if (!reqOwner) return res.status(400).json({ error: 'Invalid managed_by' });
          if (String(reqOwner) !== String(ownerScope)) {
            return res.status(403).json({ error: 'Forbidden: cannot view another owner\'s team' });
          }
        }
      } else if (managed_by) {
        const oid = parseObjectId(managed_by);
        if (!oid) return res.status(400).json({ error: 'Invalid managed_by' });
        filter.managed_by = oid;
      }
      if (role) {
        const oid = parseObjectId(role);
        if (!oid) return res.status(400).json({ error: 'Invalid role' });
        filter.role = oid;
      }
      if (status) filter.status = status;
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { phone: { $regex: q, $options: 'i' } },
        ];
      }
      const items = await TeamMember.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get single team member
  async getById(req, res) {
    try {
      const { id } = req.params;
      const doc = await TeamMember.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Team member not found' });
      // Authorization: owners or team members with view_team; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          if (String(auth.id) !== String(doc.managed_by)) {
            return res.status(403).json({ error: 'Forbidden: cannot view another owner\'s team' });
          }
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, managed_by: doc.managed_by, status: 'active' })
            .select('role managed_by')
            .lean();
          if (!tm || !tm.role) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          if (!assignedRole) return res.status(403).json({ error: 'Forbidden' });
          const hasView = assignedRole.permissions && (
            Object.values(assignedRole.permissions).some(g => g && g.view_team === true) ||
            assignedRole.permissions.view_team === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: requires view_team permission' });
        }
      }
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create team member
  async create(req, res) {
    try {
      const payload = req.body || {};
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      if (!payload.managed_by) return res.status(400).json({ error: 'managed_by is required' });
      const ownerOid = parseObjectId(payload.managed_by);
      if (!ownerOid) return res.status(400).json({ error: 'Invalid managed_by' });

      // Authorization: owners or team members with create_team; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner && String(auth.id) === String(ownerOid)) {
          allowed = true;
        } else {
          const email = entity?.registration?.email;
          if (email) {
            const tm = await TeamMember.findOne({ email, managed_by: ownerOid, status: 'active' })
              .select('role managed_by')
              .lean();
            if (tm && tm.role) {
              const assignedRole = await Role.findById(tm.role).select('permissions').lean();
              const hasCreate = assignedRole && assignedRole.permissions && (
                Object.values(assignedRole.permissions).some(g => g && g.create_team === true) ||
                assignedRole.permissions.create_team === true
              );
              allowed = !!hasCreate;
            }
          }
        }
        if (!allowed) {
          return res.status(403).json({ error: 'Forbidden: requires owner or create_team permission' });
        }
        payload.managed_by = ownerOid; // enforce scope
      }

      // Auto-create a User account for the team member (email login) without roles/primaryRole
      if (payload.email) {
        try {
          const emailLower = String(payload.email).toLowerCase();
          let userDoc = await User.findOne({ 'registration.email': emailLower }).lean();
          if (!userDoc) {
            const user = new User({
              registration: {
                email: emailLower,
                name: payload.name,
                isOwner: false,
                invitedBy: ownerOid,
              },
              profile: {
                slug: await User.generateUniqueSlug(payload.name || emailLower),
              },
            });
            await user.validate();
            userDoc = await user.save();
          } else {
            const update = {};
            if (!userDoc.registration?.name && payload.name) {
              update['registration.name'] = payload.name;
            }
            if (!userDoc.profile?.slug) {
              const nextSlug = await User.generateUniqueSlug(userDoc.registration?.name || payload.name || emailLower);
              update['profile.slug'] = nextSlug;
            }
            if (Object.keys(update).length > 0) {
              await User.findByIdAndUpdate(userDoc._id, { $set: update }, { new: true, runValidators: true }).lean();
            }
          }
        } catch (userErr) {
          // If user creation fails (e.g., duplicate elsewhere), continue with team member creation
        }
      }

      const doc = new TeamMember({ ...payload, managed_by: ownerOid });
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      // handle unique compound index errors for email/phone within owner scope
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate email or phone within owner scope' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Update team member
  async update(req, res) {
    try {
      const { id } = req.params;
      const payload = req.body || {};
      const current = await TeamMember.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Team member not found' });

      // Authorization: owners or team members with update_team; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner && String(auth.id) === String(current.managed_by)) {
          allowed = true;
        } else {
          const email = entity?.registration?.email;
          if (email) {
            const tm = await TeamMember.findOne({ email, managed_by: current.managed_by, status: 'active' })
              .select('role managed_by')
              .lean();
            if (tm && tm.role) {
              const assignedRole = await Role.findById(tm.role).select('permissions').lean();
              const hasUpdate = assignedRole && assignedRole.permissions && (
                Object.values(assignedRole.permissions).some(g => g && g.update_team === true) ||
                assignedRole.permissions.update_team === true
              );
              allowed = !!hasUpdate;
            }
          }
        }
        if (!allowed) {
          return res.status(403).json({ error: 'Forbidden: requires owner or update_team permission' });
        }
        // Prevent non-admins from changing owner scope
        if (payload.managed_by && String(payload.managed_by) !== String(current.managed_by)) {
          payload.managed_by = current.managed_by;
        }
      }

      const updated = await TeamMember.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Team member not found' });
      return res.json(updated);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate email or phone within owner scope' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete team member
  async remove(req, res) {
    try {
      const { id } = req.params;
      const current = await TeamMember.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Team member not found' });

      // Authorization: owners or team members with delete_team; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner && String(auth.id) === String(current.managed_by)) {
          allowed = true;
        } else {
          const email = entity?.registration?.email;
          if (email) {
            const tm = await TeamMember.findOne({ email, managed_by: current.managed_by, status: 'active' })
              .select('role managed_by')
              .lean();
            if (tm && tm.role) {
              const assignedRole = await Role.findById(tm.role).select('permissions').lean();
              const hasDelete = assignedRole && assignedRole.permissions && (
                Object.values(assignedRole.permissions).some(g => g && g.delete_team === true) ||
                assignedRole.permissions.delete_team === true
              );
              allowed = !!hasDelete;
            }
          }
        }
        if (!allowed) {
          return res.status(403).json({ error: 'Forbidden: requires owner or delete_team permission' });
        }
      }

      const removed = await TeamMember.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'Team member not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Get team members by owner userId (managed_by)
  async getByUserId(req, res) {
    try {
      const { managed_by } = req.query; // preserve existing query behavior
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { userId } = req.params;
      const ownerOid = parseObjectId(userId);
      if (!ownerOid) return res.status(400).json({ error: 'Invalid userId' });

      const filter = { managed_by: ownerOid };
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          if (String(ownerOid) !== String(auth.id)) {
            return res.status(403).json({ error: 'Forbidden: userId not owner' });
          }
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, managed_by: ownerOid, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_team === true) ||
            assignedRole.permissions.view_team === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: requires view_team permission' });
        }
      }
      const items = await TeamMember.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
};

export default TeamMemberController;
