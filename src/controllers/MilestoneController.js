// MilestoneController: CRUD operations and linking to Project and Invoice
// Exposes: list, getById, create, update, remove, attachToProject, detachFromProject, attachInvoice

import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';
import Invoice from '../models/Invoice.js';
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

const MilestoneController = {
  // List milestones with filters
  async list(req, res) {
    try {
      // Authorization: owners or team members with view_milestone; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { status, from, to, has_invoice, uploaded_by } = req.query;
      const filter = {};
      if (status) filter.status = status;
      if (from || to) {
        filter.due_date = {};
        if (from) filter.due_date.$gte = new Date(from);
        if (to) filter.due_date.$lte = new Date(to);
      }
      let ownerScopeId = null;
      let allowedInvoiceIds = null;
      let allowedMilestoneIds = null;
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
            Object.values(assignedRole.permissions).some((g) => g && g.view_milestone === true) ||
            assignedRole.permissions.view_milestone === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_milestone permission' });
          ownerScopeId = tm.managed_by;
        }
        // Compute allowed invoices
        const allowedClients = await Client.find({ user_id: ownerScopeId }).select('_id').lean();
        const allowedClientIds = allowedClients.map((c) => c._id);
        const invoices = await Invoice.find({
          $or: [
            { created_by: ownerScopeId },
            { client: { $in: allowedClientIds } },
          ],
        }).select('_id').lean();
        allowedInvoiceIds = invoices.map((i) => i._id);
        // Compute milestones attached to owner's projects
        const projects = await Project.find({ client: { $in: allowedClientIds } }).select('deliverables').lean();
        const midSet = new Set();
        for (const p of projects) {
          (p.deliverables || []).forEach((mid) => midSet.add(String(mid)));
        }
        allowedMilestoneIds = Array.from(midSet).map((s) => new mongoose.Types.ObjectId(s));
      }

      if (has_invoice === 'true') {
        filter['invoice_attached.invoice_id'] = auth.type !== 'admin' && allowedInvoiceIds
          ? { $in: allowedInvoiceIds }
          : { $ne: null };
      } else if (has_invoice === 'false') {
        filter['invoice_attached.invoice_id'] = null;
      } else if (auth.type !== 'admin' && allowedInvoiceIds && allowedMilestoneIds) {
        // Scope results by either invoice scope or project scope
        filter.$or = [
          { 'invoice_attached.invoice_id': { $in: allowedInvoiceIds } },
          { _id: { $in: allowedMilestoneIds } },
        ];
      }

      if (uploaded_by) {
        const oid = parseObjectId(uploaded_by);
        if (!oid) return res.status(400).json({ error: 'Invalid uploaded_by' });
        if (auth.type !== 'admin' && ownerScopeId && String(oid) !== String(ownerScopeId)) {
          return res.status(403).json({ error: 'Forbidden: uploaded_by out of scope' });
        }
        filter['uploads.uploaded_by'] = oid;
      }
      const items = await Milestone.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get single milestone
  async getById(req, res) {
    try {
      // Authorization: owners or team members with view_milestone; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const doc = await Milestone.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Milestone not found' });
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
            Object.values(assignedRole.permissions).some((g) => g && g.view_milestone === true) ||
            assignedRole.permissions.view_milestone === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_milestone permission' });
          ownerScopeId = tm.managed_by;
        }
        // Check invoice scope
        let inScope = false;
        if (doc.invoice_attached && doc.invoice_attached.invoice_id) {
          const inv = await Invoice.findById(doc.invoice_attached.invoice_id).select('created_by client').lean();
          if (inv) {
            const clientDoc = await Client.findById(inv.client).select('user_id added_by').lean();
            inScope =
              String(inv.created_by) === String(ownerScopeId) ||
              (clientDoc && (
                String(clientDoc.user_id) === String(ownerScopeId) ||
                String(clientDoc.added_by) === String(ownerScopeId)
              ));
          }
        }
        if (!inScope) {
          // Check project scope by looking up projects containing this milestone
          const projects = await Project.find({ deliverables: doc._id }).select('client').lean();
          for (const p of projects) {
            const c = await Client.findById(p.client).select('user_id added_by').lean();
            if (
              c && (
                String(c.user_id) === String(ownerScopeId) ||
                String(c.added_by) === String(ownerScopeId)
              )
            ) {
              inScope = true;
              break;
            }
          }
        }
        if (!inScope) {
          // Check uploads by owner
          const hasOwnerUpload = (doc.uploads || []).some((u) => String(u.uploaded_by) === String(ownerScopeId));
          if (!hasOwnerUpload) return res.status(403).json({ error: 'Forbidden: milestone not in scope' });
        }
      }
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create milestone
  async create(req, res) {
    try {
      // Authorization: owners or team members with create_milestone; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body || {};
      const required = ['name', 'due_date', 'amount'];
      for (const f of required) {
        if (!payload[f]) return res.status(400).json({ error: `${f} is required` });
      }
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
              Object.values(assignedRole.permissions).some((g) => g && g.create_milestone === true) ||
              assignedRole.permissions.create_milestone === true
            );
            allowed = !!hasCreate;
            ownerScopeId = tm.managed_by;
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing create_milestone permission' });
        // If uploads present, enforce uploaded_by owner scope
        if (Array.isArray(payload.uploads)) {
          for (const up of payload.uploads) {
            const uploader = parseObjectId(up.uploaded_by);
            if (!uploader) return res.status(400).json({ error: 'Invalid uploads.uploaded_by' });
            if (String(uploader) !== String(ownerScopeId)) {
              return res.status(403).json({ error: 'Forbidden: uploads must be by owner in scope' });
            }
          }
        }
      }
      const doc = new Milestone({
        name: payload.name,
        description: payload.description,
        due_date: new Date(payload.due_date),
        amount: payload.amount,
        uploads: Array.isArray(payload.uploads) ? payload.uploads : [],
        status: payload.status,
      });
      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Update milestone
  async update(req, res) {
    try {
      // Authorization: owners or team members with update_milestone; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const payload = req.body || {};
      const current = await Milestone.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Milestone not found' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let ownerScopeId = null;
        let allowed = false;
        if (entity?.registration?.isOwner) {
          ownerScopeId = auth.id;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasUpdate = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.update_milestone === true) ||
            assignedRole.permissions.update_milestone === true
          );
          if (!hasUpdate) return res.status(403).json({ error: 'Forbidden: missing update_milestone permission' });
          ownerScopeId = tm.managed_by;
        }
        // Scope via invoice
        if (current.invoice_attached && current.invoice_attached.invoice_id) {
          const inv = await Invoice.findById(current.invoice_attached.invoice_id).select('created_by client').lean();
          if (inv) {
            const clientDoc = await Client.findById(inv.client).select('user_id').lean();
            allowed = String(inv.created_by) === String(ownerScopeId) || (clientDoc && String(clientDoc.user_id) === String(ownerScopeId));
          }
        }
        if (!allowed) {
          // Scope via project
          const projects = await Project.find({ deliverables: current._id }).select('client').lean();
          for (const p of projects) {
            const c = await Client.findById(p.client).select('user_id').lean();
            if (c && String(c.user_id) === String(ownerScopeId)) {
              allowed = true;
              break;
            }
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: milestone not in scope' });

        // If changing invoice attachment, validate next invoice in scope
        if (payload.invoice_attached && payload.invoice_attached.invoice_id) {
          const nextInv = parseObjectId(payload.invoice_attached.invoice_id);
          if (!nextInv) return res.status(400).json({ error: 'Invalid invoice_id' });
          const inv = await Invoice.findById(nextInv).select('created_by client').lean();
          if (!inv) return res.status(404).json({ error: 'Invoice not found' });
          const clientDoc = await Client.findById(inv.client).select('user_id').lean();
          const inScope = String(inv.created_by) === String(ownerScopeId) || (clientDoc && String(clientDoc.user_id) === String(ownerScopeId));
          if (!inScope) return res.status(403).json({ error: 'Forbidden: invoice not in scope' });
        }
        // If changing uploads, enforce owner uploader
        if (Array.isArray(payload.uploads)) {
          for (const up of payload.uploads) {
            const uploader = parseObjectId(up.uploaded_by);
            if (!uploader) return res.status(400).json({ error: 'Invalid uploads.uploaded_by' });
            if (String(uploader) !== String(ownerScopeId)) {
              return res.status(403).json({ error: 'Forbidden: uploads must be by owner in scope' });
            }
          }
        }
      }

      const updated = await Milestone.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Milestone not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete milestone
  async remove(req, res) {
    try {
      // Authorization: owners or team members with delete_milestone; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const current = await Milestone.findById(id).lean();
      if (!current) return res.status(404).json({ error: 'Milestone not found' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let ownerScopeId = null;
        let allowed = false;
        if (entity?.registration?.isOwner) {
          ownerScopeId = auth.id;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasDelete = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.delete_milestone === true) ||
            assignedRole.permissions.delete_milestone === true
          );
          if (!hasDelete) return res.status(403).json({ error: 'Forbidden: missing delete_milestone permission' });
          ownerScopeId = tm.managed_by;
        }
        if (current.invoice_attached && current.invoice_attached.invoice_id) {
          const inv = await Invoice.findById(current.invoice_attached.invoice_id).select('created_by client').lean();
          if (inv) {
            const clientDoc = await Client.findById(inv.client).select('user_id').lean();
            allowed = String(inv.created_by) === String(ownerScopeId) || (clientDoc && String(clientDoc.user_id) === String(ownerScopeId));
          }
        }
        if (!allowed) {
          const projects = await Project.find({ deliverables: current._id }).select('client').lean();
          for (const p of projects) {
            const c = await Client.findById(p.client).select('user_id').lean();
            if (c && String(c.user_id) === String(ownerScopeId)) {
              allowed = true;
              break;
            }
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: milestone not in scope' });
      }

      const removed = await Milestone.findByIdAndDelete(id).lean();
      if (!removed) return res.status(404).json({ error: 'Milestone not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Attach milestone to a project
  async attachToProject(req, res) {
    try {
      // Authorization: owners or team members with update_milestone; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params; // milestone id
      const { project_id } = req.body || {};
      if (!project_id) return res.status(400).json({ error: 'project_id is required' });
      const mid = parseObjectId(id);
      const pid = parseObjectId(project_id);
      if (!mid) return res.status(400).json({ error: 'Invalid milestone id' });
      if (!pid) return res.status(400).json({ error: 'Invalid project_id' });
      const milestone = await Milestone.findById(mid).lean();
      if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let ownerScopeId = null;
        let allowed = false;
        if (entity?.registration?.isOwner) {
          ownerScopeId = auth.id;
          allowed = true;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const perms = assignedRole?.permissions || {};
          const hasAny = (
            Object.values(perms).some((g) => g && (g.update_milestone === true || g.create_milestone === true)) ||
            perms.update_milestone === true ||
            perms.create_milestone === true
          );
          if (!hasAny) return res.status(403).json({ error: 'Forbidden: missing update_milestone or create_milestone permission' });
          ownerScopeId = tm.managed_by;
          allowed = true;
        }
        // Verify project is in owner scope
        const proj = await Project.findById(pid).select('client').lean();
        if (!proj) return res.status(404).json({ error: 'Project not found' });
        const clientDoc = await Client.findById(proj.client).select('user_id added_by').lean();
        const inScope = clientDoc && (
          String(clientDoc.user_id) === String(ownerScopeId) ||
          String(clientDoc.added_by) === String(ownerScopeId)
        );
        if (!inScope) {
          return res.status(403).json({ error: 'Forbidden: project not in scope' });
        }
      }
      const project = await Project.findByIdAndUpdate(pid, { $addToSet: { deliverables: mid } }, { new: true }).lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });
      return res.json(project);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Detach milestone from a project
  async detachFromProject(req, res) {
    try {
      // Authorization: owners or team members with update_milestone; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params; // milestone id
      const { project_id } = req.body || {};
      if (!project_id) return res.status(400).json({ error: 'project_id is required' });
      const mid = parseObjectId(id);
      const pid = parseObjectId(project_id);
      if (!mid) return res.status(400).json({ error: 'Invalid milestone id' });
      if (!pid) return res.status(400).json({ error: 'Invalid project_id' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let ownerScopeId = null;
        let allowed = false;
        if (entity?.registration?.isOwner) {
          ownerScopeId = auth.id;
          allowed = true;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasUpdate = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.update_milestone === true) ||
            assignedRole.permissions.update_milestone === true
          );
          if (!hasUpdate) return res.status(403).json({ error: 'Forbidden: missing update_milestone permission' });
          ownerScopeId = tm.managed_by;
          allowed = true;
        }
        const proj = await Project.findById(pid).select('client').lean();
        if (!proj) return res.status(404).json({ error: 'Project not found' });
        const clientDoc = await Client.findById(proj.client).select('user_id added_by').lean();
        const inScope = clientDoc && (
          String(clientDoc.user_id) === String(ownerScopeId) ||
          String(clientDoc.added_by) === String(ownerScopeId)
        );
        if (!inScope) {
          return res.status(403).json({ error: 'Forbidden: project not in scope' });
        }
      }
      const project = await Project.findByIdAndUpdate(pid, { $pull: { deliverables: mid } }, { new: true }).lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });
      return res.json(project);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Attach an invoice to milestone
  async attachInvoice(req, res) {
    try {
      // Authorization: owners or team members with update_milestone; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params; // milestone id
      const { invoice_id } = req.body || {};
      if (!invoice_id) return res.status(400).json({ error: 'invoice_id is required' });
      const mid = parseObjectId(id);
      const iid = parseObjectId(invoice_id);
      if (!mid) return res.status(400).json({ error: 'Invalid milestone id' });
      if (!iid) return res.status(400).json({ error: 'Invalid invoice_id' });
      const invoice = await Invoice.findById(iid).lean();
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let ownerScopeId = null;
        let allowed = false;
        if (entity?.registration?.isOwner) {
          ownerScopeId = auth.id;
          allowed = true;
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasUpdate = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.update_milestone === true) ||
            assignedRole.permissions.update_milestone === true
          );
          if (!hasUpdate) return res.status(403).json({ error: 'Forbidden: missing update_milestone permission' });
          ownerScopeId = tm.managed_by;
          allowed = true;
        }
        const clientDoc = await Client.findById(invoice.client).select('user_id').lean();
        if (!clientDoc || (String(invoice.created_by) !== String(ownerScopeId) && String(clientDoc.user_id) !== String(ownerScopeId))) {
          return res.status(403).json({ error: 'Forbidden: invoice not in scope' });
        }
      }
      const updated = await Milestone.findByIdAndUpdate(
        mid,
        { $set: { invoice_attached: { invoice_id: iid, attached_on: new Date() } } },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Milestone not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default MilestoneController;
