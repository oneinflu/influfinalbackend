// ServiceController: CRUD operations for Service model with linking and validation
// Exposes: list, getById, create, update, remove

import Service from '../models/Service.js';
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

const ServiceController = {
  // List services with optional filters
  async list(req, res) {
    try {
      // Authorization: owners or team members with view_service; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { user_id, status, plan_type, content_type, q } = req.query;
      const filter = {};
      // Scope: restrict to owner's services for non-admin
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          const ownerId = new mongoose.Types.ObjectId(auth.id);
          // If query user_id provided, it must match owner
          if (user_id) {
            const oid = parseObjectId(user_id);
            if (!oid) return res.status(400).json({ error: 'Invalid user_id' });
            if (String(oid) !== String(ownerId)) {
              return res.status(403).json({ error: 'Forbidden: cannot list another owner\'s services' });
            }
          }
          filter.user_id = ownerId;
        } else {
          // Team member: must have view_service and be scoped to their managed_by
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_service === true) ||
            assignedRole.permissions.view_service === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_service permission' });
          const ownerId = new mongoose.Types.ObjectId(tm.managed_by);
          if (user_id) {
            const oid = parseObjectId(user_id);
            if (!oid) return res.status(400).json({ error: 'Invalid user_id' });
            if (String(oid) !== String(ownerId)) {
              return res.status(403).json({ error: 'Forbidden: cannot list another owner\'s services' });
            }
          }
          filter.user_id = ownerId;
        }
      } else if (user_id) {
        const oid = parseObjectId(user_id);
        if (!oid) return res.status(400).json({ error: 'Invalid user_id' });
        filter.user_id = oid;
      }
      if (status) filter.status = status;
      if (plan_type) filter['pricing_plans.plan_type'] = plan_type;
      if (content_type) {
        const ctOid = parseObjectId(content_type);
        if (!ctOid) return res.status(400).json({ error: 'Invalid content_type' });
        filter.content_types = ctOid;
      }
      if (q) filter.name = { $regex: q, $options: 'i' };

      const services = await Service.find(filter).lean();
      return res.json(services);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get a single service
  async getById(req, res) {
    try {
      // Authorization: owners or team members with view_service; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const service = await Service.findById(oid).lean();
      if (!service) return res.status(404).json({ error: 'Service not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          if (String(service.user_id) !== String(auth.id)) {
            return res.status(403).json({ error: 'Forbidden: cannot view another owner\'s service' });
          }
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_service === true) ||
            assignedRole.permissions.view_service === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_service permission' });
          if (String(service.user_id) !== String(tm.managed_by)) {
            return res.status(403).json({ error: 'Forbidden: cannot view another owner\'s service' });
          }
        }
      }
      return res.json(service);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create a new service
  async create(req, res) {
    try {
      // Authorization: owners or team members with create_service; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body || {};

      // Basic required checks
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      if (!payload.user_id) return res.status(400).json({ error: 'user_id is required' });

      const userOid = parseObjectId(payload.user_id);
      if (!userOid) return res.status(400).json({ error: 'Invalid user_id' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        const ownerId = new mongoose.Types.ObjectId(entity?.registration?.isOwner ? auth.id : undefined);
        if (entity?.registration?.isOwner) {
          allowed = String(userOid) === String(ownerId);
        } else {
          const email = entity?.registration?.email;
          if (email) {
            const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
            if (tm && tm.role && tm.managed_by) {
              const assignedRole = await Role.findById(tm.role).select('permissions').lean();
              const hasCreate = assignedRole && assignedRole.permissions && (
                Object.values(assignedRole.permissions).some((g) => g && g.create_service === true) ||
                assignedRole.permissions.create_service === true
              );
              allowed = !!hasCreate && String(userOid) === String(tm.managed_by);
            }
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing create_service or wrong owner scope' });
      }

      // Enforce uniqueness: name per user
      const exists = await Service.findOne({ name: payload.name.trim(), user_id: userOid }).lean();
      if (exists) return res.status(409).json({ error: 'Service name already exists for this user' });

      // Normalize and validate content_types
      let contentTypes = [];
      if (Array.isArray(payload.content_types)) {
        for (const id of payload.content_types) {
          const oid = parseObjectId(id);
          if (!oid) return res.status(400).json({ error: `Invalid content_type id: ${id}` });
          contentTypes.push(oid);
        }
        // de-dupe
        contentTypes = [...new Set(contentTypes.map(String))].map((s) => new mongoose.Types.ObjectId(s));
      }

      const doc = new Service({
        name: payload.name.trim(),
        description: payload.description,
        deliverables: Array.isArray(payload.deliverables) ? payload.deliverables : [],
        is_contact_for_pricing: !!payload.is_contact_for_pricing,
        is_barter: !!payload.is_barter,
        is_negotiable: !!payload.is_negotiable,
        user_id: userOid,
        content_types: contentTypes,
        pricing_plans: Array.isArray(payload.pricing_plans) ? payload.pricing_plans : [],
        status: payload.status || 'active',
      });

      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Update an existing service
  async update(req, res) {
    try {
      // Authorization: owners or team members with update_service; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });

      const payload = req.body || {};
      if (payload.name) payload.name = String(payload.name).trim();

      const current = await Service.findById(oid).lean();
      if (!current) return res.status(404).json({ error: 'Service not found' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(current.user_id) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (email) {
            const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
            if (tm && tm.role && tm.managed_by) {
              const assignedRole = await Role.findById(tm.role).select('permissions').lean();
              const hasUpdate = assignedRole && assignedRole.permissions && (
                Object.values(assignedRole.permissions).some((g) => g && g.update_service === true) ||
                assignedRole.permissions.update_service === true
              );
              allowed = !!hasUpdate && String(current.user_id) === String(tm.managed_by);
            }
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing update_service or wrong owner scope' });

        // If changing user_id, enforce same owner scope
        if (payload.user_id) {
          const nextUser = parseObjectId(payload.user_id);
          if (!nextUser) return res.status(400).json({ error: 'Invalid user_id' });
          if (entity?.registration?.isOwner) {
            if (String(nextUser) !== String(auth.id)) {
              return res.status(403).json({ error: 'Forbidden: cannot reassign service to another owner' });
            }
          } else {
            // team member scope
            const email = entity?.registration?.email;
            const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('managed_by').lean() : null;
            if (!tm || String(nextUser) !== String(tm.managed_by)) {
              return res.status(403).json({ error: 'Forbidden: cannot reassign service outside owner scope' });
            }
          }
        }
      }

      // Normalize content_types if provided
      if (Array.isArray(payload.content_types)) {
        let contentTypes = [];
        for (const id of payload.content_types) {
          const oid = parseObjectId(id);
          if (!oid) return res.status(400).json({ error: `Invalid content_type id: ${id}` });
          contentTypes.push(oid);
        }
        payload.content_types = [...new Set(contentTypes.map(String))].map((s) => new mongoose.Types.ObjectId(s));
      }

      // If changing name or user_id, check uniqueness
      if (payload.name || payload.user_id) {
        const nextUser = payload.user_id ? parseObjectId(payload.user_id) : undefined;
        if (payload.user_id && !nextUser) return res.status(400).json({ error: 'Invalid user_id' });
        const userToCheck = nextUser || current.user_id;
        const nameToCheck = payload.name || current.name;
        const dup = await Service.findOne({
          _id: { $ne: oid },
          name: nameToCheck,
          user_id: userToCheck,
        }).lean();
        if (dup) return res.status(409).json({ error: 'Service name already exists for this user' });
      }

      const updated = await Service.findByIdAndUpdate(
        oid,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Service not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete a service
  async remove(req, res) {
    try {
      // Authorization: owners or team members with delete_service; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });

      const current = await Service.findById(oid).lean();
      if (!current) return res.status(404).json({ error: 'Service not found' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(current.user_id) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (email) {
            const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
            if (tm && tm.role && tm.managed_by) {
              const assignedRole = await Role.findById(tm.role).select('permissions').lean();
              const hasDelete = assignedRole && assignedRole.permissions && (
                Object.values(assignedRole.permissions).some((g) => g && g.delete_service === true) ||
                assignedRole.permissions.delete_service === true
              );
              allowed = !!hasDelete && String(current.user_id) === String(tm.managed_by);
            }
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing delete_service or wrong owner scope' });
      }

      // Optional: block deletion if linked by Projects/Leads
      // You can replace this with soft-delete: set status = 'archived'
      const removed = await Service.findByIdAndDelete(oid).lean();
      if (!removed) return res.status(404).json({ error: 'Service not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default ServiceController;