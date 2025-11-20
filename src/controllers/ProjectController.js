// ProjectController: CRUD operations and filters for Project model
// Exposes: list, getById, create, update, remove

import Project from '../models/Project.js';
import Client from '../models/Client.js';
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

const ProjectController = {
  // List projects with filters and search
  async list(req, res) {
    try {
      // Authorization: owners or team members with view_project; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { client, status, approval_status, service, collaborator, category, from, to, q } = req.query;
      const filter = {};
      // Scope to allowed clients for non-admin
      if (auth.type !== 'admin') {
        let allowedClients = [];
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          allowedClients = await Client.find({ added_by: auth.id }).select('_id').lean();
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_project === true) ||
            assignedRole.permissions.view_project === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_project permission' });
          allowedClients = await Client.find({ added_by: tm.managed_by }).select('_id').lean();
        }
        const allowedIds = allowedClients.map((c) => c._id);
        if (client) {
          const oid = parseObjectId(client);
          if (!oid) return res.status(400).json({ error: 'Invalid client' });
          if (!allowedIds.some((id) => String(id) === String(oid))) {
            return res.status(403).json({ error: 'Forbidden: client not in scope' });
          }
          filter.client = oid;
        } else {
          filter.client = { $in: allowedIds };
        }
      } else if (client) {
        const oid = parseObjectId(client);
        if (!oid) return res.status(400).json({ error: 'Invalid client' });
        filter.client = oid;
      }
      if (status) filter.status = status;
      if (approval_status) filter.approval_status = approval_status;
      if (service) {
        const oid = parseObjectId(service);
        if (!oid) return res.status(400).json({ error: 'Invalid service' });
        filter.services = oid;
      }
      if (collaborator) {
        const oid = parseObjectId(collaborator);
        if (!oid) return res.status(400).json({ error: 'Invalid collaborator' });
        filter.collaborators = oid;
      }
      if (category) filter.project_category = category;
      if (from || to) {
        filter.end_date = {};
        if (from) filter.end_date.$gte = new Date(from);
        if (to) filter.end_date.$lte = new Date(to);
      }
      if (q) filter.name = { $regex: q, $options: 'i' };
      const items = await Project.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get single project
  async getById(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const doc = await Project.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Project not found' });
      if (auth.type !== 'admin') {
        const clientDoc = await Client.findById(doc.client).select('added_by').lean();
        if (!clientDoc) return res.status(404).json({ error: 'Client not found' });
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          if (String(clientDoc.added_by) !== String(auth.id)) {
            return res.status(403).json({ error: 'Forbidden: project not in owner scope' });
          }
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_project === true) ||
            assignedRole.permissions.view_project === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_project permission' });
          if (String(clientDoc.added_by) !== String(tm.managed_by)) {
            return res.status(403).json({ error: 'Forbidden: project not in team scope' });
          }
        }
      }
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create project
  async create(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body || {};
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      if (!payload.client) return res.status(400).json({ error: 'client is required' });
      const clientOid = parseObjectId(payload.client);
      if (!clientOid) return res.status(400).json({ error: 'Invalid client' });
      const clientDoc = await Client.findById(clientOid).select('added_by').lean();
      if (!clientDoc) return res.status(404).json({ error: 'Client not found' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(clientDoc.added_by) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (email) {
            const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
            if (tm && tm.role && tm.managed_by) {
              const assignedRole = await Role.findById(tm.role).select('permissions').lean();
              const hasCreate = assignedRole && assignedRole.permissions && (
                Object.values(assignedRole.permissions).some((g) => g && g.create_project === true) ||
                assignedRole.permissions.create_project === true
              );
              allowed = !!hasCreate && String(clientDoc.added_by) === String(tm.managed_by);
            }
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing create_project or wrong client scope' });
      }
      const doc = new Project(payload);
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Update project
  async update(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const payload = req.body || {};
      const current = await Project.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Project not found' });

      if (auth.type !== 'admin') {
        const currentClient = await Client.findById(current.client).select('added_by').lean();
        if (!currentClient) return res.status(404).json({ error: 'Client not found' });
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(currentClient.added_by) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (email) {
            const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
            if (tm && tm.role && tm.managed_by) {
              const assignedRole = await Role.findById(tm.role).select('permissions').lean();
              const hasUpdate = assignedRole && assignedRole.permissions && (
                Object.values(assignedRole.permissions).some((g) => g && g.update_project === true) ||
                assignedRole.permissions.update_project === true
              );
              allowed = !!hasUpdate && String(currentClient.added_by) === String(tm.managed_by);
            }
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing update_project or wrong client scope' });

        // If changing client, ensure new client stays within scope
        if (payload.client) {
          const nextClient = parseObjectId(payload.client);
          if (!nextClient) return res.status(400).json({ error: 'Invalid client' });
          const nextClientDoc = await Client.findById(nextClient).select('added_by').lean();
          if (!nextClientDoc) return res.status(404).json({ error: 'Client not found' });
          if (entity?.registration?.isOwner) {
            if (String(nextClientDoc.added_by) !== String(auth.id)) {
              return res.status(403).json({ error: 'Forbidden: cannot move project to another owner' });
            }
          } else {
            const email = entity?.registration?.email;
            const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('managed_by').lean() : null;
            if (!tm || String(nextClientDoc.added_by) !== String(tm.managed_by)) {
              return res.status(403).json({ error: 'Forbidden: cannot move project outside team scope' });
            }
          }
        }
      }
      const updated = await Project.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Project not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete project
  async remove(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const current = await Project.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Project not found' });

      if (auth.type !== 'admin') {
        const clientDoc = await Client.findById(current.client).select('added_by').lean();
        if (!clientDoc) return res.status(404).json({ error: 'Client not found' });
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          allowed = String(clientDoc.added_by) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (email) {
            const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
            if (tm && tm.role && tm.managed_by) {
              const assignedRole = await Role.findById(tm.role).select('permissions').lean();
              const hasDelete = assignedRole && assignedRole.permissions && (
                Object.values(assignedRole.permissions).some((g) => g && g.delete_project === true) ||
                assignedRole.permissions.delete_project === true
              );
              allowed = !!hasDelete && String(clientDoc.added_by) === String(tm.managed_by);
            }
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing delete_project or wrong client scope' });
      }

      const removed = await Project.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'Project not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default ProjectController;