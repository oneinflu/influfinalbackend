// RoleController: CRUD operations and filters for Role model
// Exposes: list, getById, create, update, remove

import Role from '../models/Role.js';
import TeamMember from '../models/TeamMember.js';
import { getAuthFromRequest } from '../middleware/auth.js';
import mongoose from 'mongoose';

function parseObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

const RoleController = {
  // List roles with filters and search
  async list(req, res) {
    try {
      const { createdBy, is_system_role, q } = req.query;
      const filter = {};
      if (createdBy) {
        const oid = parseObjectId(createdBy);
        if (!oid) return res.status(400).json({ error: 'Invalid createdBy' });
        filter.createdBy = oid;
      }
      if (is_system_role === 'true') filter.is_system_role = true;
      else if (is_system_role === 'false') filter.is_system_role = false;
      if (q) filter.name = { $regex: q, $options: 'i' };
      const items = await Role.find(filter).lean();

      // Augment roles with assigned_count computed from TeamMember documents
      if (items.length > 0) {
        const roleIds = items.map((r) => r._id);
        // Group counts of team members per role; owner scope enforced via Role.createdBy
        const tmCounts = await TeamMember.aggregate([
          { $match: { role: { $in: roleIds } } },
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ]);
        const countMap = new Map(tmCounts.map((g) => [String(g._id), g.count]));
        for (const r of items) {
          // assigned_count reflects number of TeamMembers linked to this role
          r.assigned_count = countMap.get(String(r._id)) || 0;
        }
      }

      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get one role
  async getById(req, res) {
    try {
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const doc = await Role.findById(oid).lean();
      if (!doc) return res.status(404).json({ error: 'Role not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create role
  async create(req, res) {
    try {
      const payload = req.body || {};
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      if (!payload.createdBy) return res.status(400).json({ error: 'createdBy is required' });
      const ownerOid = parseObjectId(payload.createdBy);
      if (!ownerOid) return res.status(400).json({ error: 'Invalid createdBy' });

      // Authorization: owners or team members with create_role permission (admins bypass)
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
        // Also allow top-level keys
        for (const key of keys) {
          if (permissions[key] === true) return true;
        }
        return false;
      }

      async function canManageRoles(ownerId, neededKeys) {
        if (auth.type === 'admin') return true;
        if (auth.type !== 'user') return false;
        const entity = auth.entity || {};
        // Owner check
        if (entity?.registration?.isOwner && String(auth.id) === String(ownerId)) {
          return true;
        }
        // Team member check by email under this owner
        const email = entity?.registration?.email;
        if (!email) return false;
        const tm = await TeamMember.findOne({ email, managed_by: ownerId, status: 'active' })
          .select('role managed_by')
          .lean();
        if (!tm || !tm.role) return false;
        const assignedRole = await Role.findById(tm.role).select('permissions').lean();
        if (!assignedRole) return false;
        return hasPermissionKeys(assignedRole.permissions, neededKeys);
      }

      const allowed = await canManageRoles(ownerOid, ['create_role']);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden: requires owner or create_role permission' });
      }

      // Unique name per owner
      const exists = await Role.findOne({ name: payload.name.trim(), createdBy: ownerOid }).lean();
      if (exists) return res.status(409).json({ error: 'Role name already exists for this owner' });

      // Prevent non-admins from creating system or locked roles
      const isSystem = !!payload.is_system_role;
      const isLocked = !!payload.locked;
      if (auth.type !== 'admin' && (isSystem || isLocked)) {
        return res.status(403).json({ error: 'Only admins can create system or locked roles' });
      }

      const doc = new Role({
        name: String(payload.name).trim(),
        description: payload.description,
        permissions: payload.permissions || {},
        assigned_users: Array.isArray(payload.assigned_users) ? payload.assigned_users : [],
        is_system_role: auth.type === 'admin' ? !!payload.is_system_role : false,
        locked: auth.type === 'admin' ? !!payload.locked : false,
        createdBy: ownerOid,
      });
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate role name for owner' });
      }
      return res.status(400).json({ error: err.message });
    }
  },

  // Update role
  async update(req, res) {
    try {
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const payload = req.body || {};

      // Load current role to determine owner
      const current = await Role.findById(oid).lean();
      if (!current) return res.status(404).json({ error: 'Role not found' });

      // Authorization: owners or team members with update_role permission (admins bypass)
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

      async function canManageRoles(ownerId, neededKeys) {
        if (auth.type === 'admin') return true;
        if (auth.type !== 'user') return false;
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner && String(auth.id) === String(ownerId)) {
          return true;
        }
        const email = entity?.registration?.email;
        if (!email) return false;
        const tm = await TeamMember.findOne({ email, managed_by: ownerId, status: 'active' })
          .select('role managed_by')
          .lean();
        if (!tm || !tm.role) return false;
        const assignedRole = await Role.findById(tm.role).select('permissions').lean();
        if (!assignedRole) return false;
        return hasPermissionKeys(assignedRole.permissions, neededKeys);
      }

      const allowed = await canManageRoles(current.createdBy, ['update_role']);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden: requires owner or update_role permission' });
      }

      // Enforce system/locked rules
      if (current.locked === true) {
        return res.status(403).json({ error: 'Locked roles cannot be updated' });
      }
      if (current.is_system_role === true && auth.type !== 'admin') {
        return res.status(403).json({ error: 'Only admins can update system roles' });
      }

      // If changing name or createdBy, re-check uniqueness
      if (payload.name || payload.createdBy) {
        // Prevent non-admins from reassigning role ownership
        let nextOwner = current.createdBy;
        if (payload.createdBy) {
          const parsed = parseObjectId(payload.createdBy);
          if (!parsed) return res.status(400).json({ error: 'Invalid createdBy' });
          nextOwner = auth.type === 'admin' ? parsed : current.createdBy;
        }
        const nextName = payload.name ? String(payload.name).trim() : current.name;
        const dup = await Role.findOne({ _id: { $ne: oid }, name: nextName, createdBy: nextOwner }).lean();
        if (dup) return res.status(409).json({ error: 'Role name already exists for this owner' });
        if (auth.type !== 'admin') {
          payload.createdBy = current.createdBy;
        }
      }

      // Prevent non-admins from toggling system or locked flags
      if (auth.type !== 'admin') {
        if ('is_system_role' in payload) delete payload.is_system_role;
        if ('locked' in payload) delete payload.locked;
      }

      const updated = await Role.findByIdAndUpdate(
        oid,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Role not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete role
  async remove(req, res) {
    try {
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const current = await Role.findById(oid).lean();
      if (!current) return res.status(404).json({ error: 'Role not found' });

      // Authorization: owners or team members with delete_role permission (admins bypass)
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

      async function canManageRoles(ownerId, neededKeys) {
        if (auth.type === 'admin') return true;
        if (auth.type !== 'user') return false;
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner && String(auth.id) === String(ownerId)) {
          return true;
        }
        const email = entity?.registration?.email;
        if (!email) return false;
        const tm = await TeamMember.findOne({ email, managed_by: ownerId, status: 'active' })
          .select('role managed_by')
          .lean();
        if (!tm || !tm.role) return false;
        const assignedRole = await Role.findById(tm.role).select('permissions').lean();
        if (!assignedRole) return false;
        return hasPermissionKeys(assignedRole.permissions, neededKeys);
      }

      const allowed = await canManageRoles(current.createdBy, ['delete_role']);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden: requires owner or delete_role permission' });
      }

      // Enforce system/locked rules
      if (current.locked === true) {
        return res.status(403).json({ error: 'Locked roles cannot be deleted' });
      }
      if (current.is_system_role === true && auth.type !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete system roles' });
      }

      const removed = await Role.findByIdAndDelete(oid).lean();
      if (!removed) return res.status(404).json({ error: 'Role not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default RoleController;