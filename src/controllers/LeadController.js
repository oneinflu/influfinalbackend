// LeadController: CRUD operations and filters for Lead model
// Exposes: list, getById, create, update, remove

import Lead from '../models/Lead.js';
import TeamMember from '../models/TeamMember.js';
import Role from '../models/Role.js';
import Service from '../models/Service.js';
import { getAuthFromRequest } from '../middleware/auth.js';
import mongoose from 'mongoose';

function parseObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

const LeadController = {
  // List leads with filters and text search
  async list(req, res) {
    try {
      // Authorization: owners or team members with view_lead; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { status, assigned_to, service, from, to, q } = req.query;
      const filter = {};
      if (status) filter.status = status;
      let ownerScopeId = null;
      let allowedTeamIds = null;
      let allowedServiceIds = null;
      let isOwner = false;
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        isOwner = entity?.registration?.isOwner === true;
        if (isOwner) {
          ownerScopeId = new mongoose.Types.ObjectId(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_lead === true) ||
            assignedRole.permissions.view_lead === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_lead permission' });
          ownerScopeId = tm.managed_by;
          const teams = await TeamMember.find({ managed_by: ownerScopeId, status: 'active' }).select('_id').lean();
          allowedTeamIds = teams.map((t) => t._id);
          const services = await Service.find({ user_id: ownerScopeId }).select('_id').lean();
          allowedServiceIds = services.map((s) => s._id);
        }
      }
      if (assigned_to) {
        const oid = parseObjectId(assigned_to);
        if (!oid) return res.status(400).json({ error: 'Invalid assigned_to' });
        if (auth.type !== 'admin' && !isOwner && allowedTeamIds && !allowedTeamIds.some((id) => String(id) === String(oid))) {
          return res.status(403).json({ error: 'Forbidden: assigned_to not in scope' });
        }
        filter.assigned_to = oid;
      }
      if (service) {
        const oid = parseObjectId(service);
        if (!oid) return res.status(400).json({ error: 'Invalid service' });
        if (auth.type !== 'admin' && !isOwner && allowedServiceIds && !allowedServiceIds.some((id) => String(id) === String(oid))) {
          return res.status(403).json({ error: 'Forbidden: service not in scope' });
        }
        filter.looking_for = oid;
      }
      if (auth.type !== 'admin' && !isOwner && !assigned_to && !service) {
        // Default scope for non-admin when no explicit filters provided
        filter.$or = [
          { assigned_to: { $in: allowedTeamIds } },
          { looking_for: { $in: allowedServiceIds } },
        ];
      }
      if (from || to) {
        filter.created_on = {};
        if (from) filter.created_on.$gte = new Date(from);
        if (to) filter.created_on.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { phone: { $regex: q, $options: 'i' } },
        ];
      }
      const items = await Lead.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get single lead
  async getById(req, res) {
    try {
      // Authorization: owners or team members with view_lead; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const doc = await Lead.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Lead not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        const isOwner = entity?.registration?.isOwner === true;
        let ownerScopeId = null;
        if (!isOwner) {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_lead === true) ||
            assignedRole.permissions.view_lead === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_lead permission' });
          ownerScopeId = tm.managed_by;
          // Scope: lead assigned to owner's team OR looking_for owner's services
          const allowedTeam = await TeamMember.find({ managed_by: ownerScopeId, status: 'active' }).select('_id').lean();
          const allowedTeamIds = allowedTeam.map((t) => String(t._id));
          let inScope = (doc.assigned_to && allowedTeamIds.includes(String(doc.assigned_to)));
          if (!inScope) {
            const services = await Service.find({ user_id: ownerScopeId }).select('_id').lean();
            const allowedServiceIds = services.map((s) => String(s._id));
            inScope = (doc.looking_for || []).some((sid) => allowedServiceIds.includes(String(sid)));
          }
          if (!inScope) return res.status(403).json({ error: 'Forbidden: lead not in scope' });
        }
      }
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create lead
  async create(req, res) {
    try {
      // Authorization: owners or team members with create_lead; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body || {};
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      let ownerScopeId = null;
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        
        const isOwner = entity?.registration?.isOwner === true;
        if (isOwner) {
          ownerScopeId = new mongoose.Types.ObjectId(auth.id);
          allowed = true;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasCreate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.create_lead === true) ||
              assignedRole.permissions.create_lead === true
            );
            allowed = !!hasCreate;
            ownerScopeId = tm.managed_by;
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing create_lead permission' });
      }
      // Validate assigned_to within scope
      if (payload.assigned_to) {
        const aid = parseObjectId(payload.assigned_to);
        if (!aid) return res.status(400).json({ error: 'Invalid assigned_to' });
        if (auth.type !== 'admin') {
          const entity = auth.entity || {};
          const isOwner = entity?.registration?.isOwner === true;
          if (!isOwner) {
            const assignedTm = await TeamMember.findById(aid).select('managed_by status').lean();
            if (!assignedTm || String(assignedTm.managed_by) !== String(ownerScopeId) || assignedTm.status !== 'active') {
              return res.status(403).json({ error: 'Forbidden: assigned_to not in scope' });
            }
          }
        }
      }
      // Validate looking_for services within scope
      if (Array.isArray(payload.looking_for) && auth.type !== 'admin') {
        const entity = auth.entity || {};
        const isOwner = entity?.registration?.isOwner === true;
        if (!isOwner) {
          for (const sid of payload.looking_for) {
            const oid = parseObjectId(sid);
            if (!oid) return res.status(400).json({ error: 'Invalid service in looking_for' });
            const svc = await Service.findById(oid).select('user_id').lean();
            if (!svc || String(svc.user_id) !== String(ownerScopeId)) {
              return res.status(403).json({ error: 'Forbidden: service not in scope' });
            }
          }
        }
      }
      const doc = new Lead(payload);
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Update lead
  async update(req, res) {
    try {
      // Authorization: owners or team members with update_lead; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const payload = req.body || {};
      const current = await Lead.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Lead not found' });
      let ownerScopeId = null;
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        const isOwner = entity?.registration?.isOwner === true;
        let allowed = false;
        if (isOwner) {
          ownerScopeId = auth.id;
          allowed = true;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasUpdate = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.update_lead === true) ||
            assignedRole.permissions.update_lead === true
          );
          if (!hasUpdate) return res.status(403).json({ error: 'Forbidden: missing update_lead permission' });
          ownerScopeId = tm.managed_by;
          allowed = true;
        }
        // Scope check on current document (owners bypass)
        if (!isOwner) {
          const allowedTeam = await TeamMember.find({ managed_by: ownerScopeId, status: 'active' }).select('_id').lean();
          const allowedTeamIds = allowedTeam.map((t) => String(t._id));
          let inScope = (current.assigned_to && allowedTeamIds.includes(String(current.assigned_to)));
          if (!inScope) {
            const services = await Service.find({ user_id: ownerScopeId }).select('_id').lean();
            const allowedServiceIds = services.map((s) => String(s._id));
            inScope = (current.looking_for || []).some((sid) => allowedServiceIds.includes(String(sid)));
          }
          if (!inScope) return res.status(403).json({ error: 'Forbidden: lead not in scope' });
        }

        // Validate changes remain in scope
        if (payload.assigned_to) {
          const aid = parseObjectId(payload.assigned_to);
          if (!aid) return res.status(400).json({ error: 'Invalid assigned_to' });
          const assignedTm = await TeamMember.findById(aid).select('managed_by status').lean();
          if (!isOwner && (!assignedTm || String(assignedTm.managed_by) !== String(ownerScopeId) || assignedTm.status !== 'active')) {
            return res.status(403).json({ error: 'Forbidden: assigned_to not in scope' });
          }
        }
        if (Array.isArray(payload.looking_for)) {
          if (!isOwner) {
            for (const sid of payload.looking_for) {
              const oid = parseObjectId(sid);
              if (!oid) return res.status(400).json({ error: 'Invalid service in looking_for' });
              const svc = await Service.findById(oid).select('user_id').lean();
              if (!svc || String(svc.user_id) !== String(ownerScopeId)) {
                return res.status(403).json({ error: 'Forbidden: service not in scope' });
              }
            }
          }
        }
      }
      const updated = await Lead.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Lead not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete lead
  async remove(req, res) {
    try {
      // Authorization: owners or team members with delete_lead; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const current = await Lead.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Lead not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        const isOwner = entity?.registration?.isOwner === true;
        let ownerScopeId = null;
        let hasDelete = false;
        if (isOwner) {
          ownerScopeId = auth.id;
          hasDelete = true;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          hasDelete = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.delete_lead === true) ||
            assignedRole.permissions.delete_lead === true
          );
          if (!hasDelete) return res.status(403).json({ error: 'Forbidden: missing delete_lead permission' });
          ownerScopeId = tm.managed_by;
        }
        if (!isOwner) {
          const allowedTeam = await TeamMember.find({ managed_by: ownerScopeId, status: 'active' }).select('_id').lean();
          const allowedTeamIds = allowedTeam.map((t) => String(t._id));
          let inScope = (current.assigned_to && allowedTeamIds.includes(String(current.assigned_to)));
          if (!inScope) {
            const services = await Service.find({ user_id: ownerScopeId }).select('_id').lean();
            const allowedServiceIds = services.map((s) => String(s._id));
            inScope = (current.looking_for || []).some((sid) => allowedServiceIds.includes(String(sid)));
          }
          if (!inScope) return res.status(403).json({ error: 'Forbidden: lead not in scope' });
        }
      }
      const removed = await Lead.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'Lead not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default LeadController;
