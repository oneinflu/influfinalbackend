// InvoiceController: CRUD operations for Invoice model with validation and soft cancel
// Exposes: list, getById, create, update, cancel

import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
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

async function recomputePaymentStatus(invoiceId) {
  const totalAgg = await Payment.aggregate([
    { $match: { invoice_id: new mongoose.Types.ObjectId(invoiceId) } },
    { $group: { _id: null, paid: { $sum: '$amount' } } },
  ]);
  const paid = totalAgg[0]?.paid || 0;
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) return;
  let nextStatus = 'pending';
  if (paid >= (invoice.total || 0)) nextStatus = 'paid';
  else if (paid > 0) nextStatus = 'partially_paid';
  await Invoice.findByIdAndUpdate(invoiceId, { $set: { payment_status: nextStatus } }).lean();
}

const InvoiceController = {
  // List invoices with filters
  async list(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { client, created_by, payment_status, from, to, q } = req.query;
      const filter = {};

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let ownerScopeId = null;
        if (entity?.registration?.isOwner) {
          ownerScopeId = new mongoose.Types.ObjectId(auth.id);
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean();
          if (!tm || !tm.role || !tm.managed_by) return res.status(403).json({ error: 'Forbidden' });
          const assignedRole = await Role.findById(tm.role).select('permissions').lean();
          const hasView = assignedRole && assignedRole.permissions && (
            Object.values(assignedRole.permissions).some((g) => g && g.view_invoice === true) ||
            assignedRole.permissions.view_invoice === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_invoice permission' });
          ownerScopeId = tm.managed_by;
        }
        const allowedClients = await Client.find({ added_by: ownerScopeId }).select('_id').lean();
        const allowedClientIds = allowedClients.map((c) => c._id);

        if (client) {
          const oid = parseObjectId(client);
          if (!oid) return res.status(400).json({ error: 'Invalid client' });
          if (!allowedClientIds.some((id) => String(id) === String(oid))) {
            return res.status(403).json({ error: 'Forbidden: client not in scope' });
          }
          filter.client = oid;
        }
        if (created_by) {
          const oid = parseObjectId(created_by);
          if (!oid) return res.status(400).json({ error: 'Invalid created_by' });
          if (String(oid) !== String(ownerScopeId)) {
            return res.status(403).json({ error: 'Forbidden: created_by not in scope' });
          }
          filter.created_by = oid;
        }
        if (!filter.client && !filter.created_by) {
          filter.$or = [{ created_by: ownerScopeId }, { client: { $in: allowedClientIds } }];
        }
      } else {
        if (client) {
          const oid = parseObjectId(client);
          if (!oid) return res.status(400).json({ error: 'Invalid client' });
          filter.client = oid;
        }
        if (created_by) {
          const oid = parseObjectId(created_by);
          if (!oid) return res.status(400).json({ error: 'Invalid created_by' });
          filter.created_by = oid;
        }
      }

      if (payment_status) filter.payment_status = payment_status;
      if (from || to) {
        filter.issue_date = {};
        if (from) filter.issue_date.$gte = new Date(from);
        if (to) filter.issue_date.$lte = new Date(to);
      }
      if (q) filter.invoice_number = { $regex: q, $options: 'i' };

      const items = await Invoice.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get invoice by id
  async getById(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const invoice = await Invoice.findById(oid).lean();
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
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
            Object.values(assignedRole.permissions).some((g) => g && g.view_invoice === true) ||
            assignedRole.permissions.view_invoice === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_invoice permission' });
          ownerScopeId = tm.managed_by;
        }
        const clientDoc = await Client.findById(invoice.client).select('added_by').lean();
        const withinScope = String(invoice.created_by) === String(ownerScopeId) ||
          (clientDoc && String(clientDoc.added_by) === String(ownerScopeId));
        if (!withinScope) return res.status(403).json({ error: 'Forbidden: invoice not in scope' });
      }
      return res.json(invoice);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create invoice
  async create(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body || {};
      const required = ['invoice_number', 'issue_date', 'created_by', 'client'];
      for (const f of required) {
        if (!payload[f]) return res.status(400).json({ error: `${f} is required` });
      }
      const createdBy = parseObjectId(payload.created_by);
      const client = parseObjectId(payload.client);
      const project = payload.project ? parseObjectId(payload.project) : undefined;
      if (!createdBy) return res.status(400).json({ error: 'Invalid created_by' });
      if (!client) return res.status(400).json({ error: 'Invalid client' });
      if (payload.project && !project) return res.status(400).json({ error: 'Invalid project' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        const clientDoc = await Client.findById(client).select('added_by').lean();
        if (!clientDoc) return res.status(404).json({ error: 'Client not found' });
        if (entity?.registration?.isOwner) {
          const ownerId = new mongoose.Types.ObjectId(auth.id);
          allowed = String(createdBy) === String(ownerId) && String(clientDoc.added_by) === String(ownerId);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasCreate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.create_invoice === true) ||
              assignedRole.permissions.create_invoice === true
            );
            allowed = !!hasCreate && String(createdBy) === String(tm.managed_by) && String(clientDoc.added_by) === String(tm.managed_by);
        }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing create_invoice or wrong scope' });
      }

      // Uniqueness on invoice_number
      const dup = await Invoice.findOne({ invoice_number: payload.invoice_number.trim() }).lean();
      if (dup) return res.status(409).json({ error: 'invoice_number already exists' });

      const doc = new Invoice({
        invoice_number: String(payload.invoice_number).trim(),
        issue_date: new Date(payload.issue_date),
        due_date: payload.due_date ? new Date(payload.due_date) : undefined,
        tax_percentage: payload.tax_percentage ?? 0,
        subtotal: payload.subtotal ?? 0,
        total: payload.total, // model will recompute if inconsistent
        currency: payload.currency || 'INR',
        payment_status: payload.payment_status || 'pending',
        pdf_url: payload.pdf_url,
        created_by: createdBy,
        client,
        project,
        payments: Array.isArray(payload.payments) ? payload.payments : [],
        notes: payload.notes,
      });

      await doc.validate();
      const saved = await doc.save();
      return res.status(201).json(saved);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Update invoice
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

      // Verify current document and scope
      const current = await Invoice.findById(oid).lean();
      if (!current) return res.status(404).json({ error: 'Invoice not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        const clientDoc = await Client.findById(current.client).select('added_by').lean();
        if (!clientDoc) return res.status(404).json({ error: 'Client not found' });
        if (entity?.registration?.isOwner) {
          allowed = String(current.created_by) === String(auth.id) || String(clientDoc.added_by) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasUpdate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.update_invoice === true) ||
              assignedRole.permissions.update_invoice === true
            );
            allowed = !!hasUpdate && (String(current.created_by) === String(tm.managed_by) || String(clientDoc.added_by) === String(tm.managed_by));
        }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing update_invoice or wrong scope' });

        if (payload.created_by) {
          const nextCreatedBy = parseObjectId(payload.created_by);
          if (!nextCreatedBy) return res.status(400).json({ error: 'Invalid created_by' });
          if (entity?.registration?.isOwner) {
            if (String(nextCreatedBy) !== String(auth.id)) {
              return res.status(403).json({ error: 'Forbidden: cannot move invoice to another owner' });
            }
          } else {
            const email = entity?.registration?.email;
            const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('managed_by').lean() : null;
            if (!tm || String(nextCreatedBy) !== String(tm.managed_by)) {
              return res.status(403).json({ error: 'Forbidden: cannot move invoice outside team scope' });
            }
          }
        }
        if (payload.client) {
          const nextClient = parseObjectId(payload.client);
          if (!nextClient) return res.status(400).json({ error: 'Invalid client' });
          const nextClientDoc = await Client.findById(nextClient).select('added_by').lean();
          if (!nextClientDoc) return res.status(404).json({ error: 'Client not found' });
          if (entity?.registration?.isOwner) {
            if (String(nextClientDoc.added_by) !== String(auth.id)) {
              return res.status(403).json({ error: 'Forbidden: cannot move invoice to client outside owner scope' });
            }
          } else {
            const email = entity?.registration?.email;
            const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('managed_by').lean() : null;
            if (!tm || String(nextClientDoc.added_by) !== String(tm.managed_by)) {
              return res.status(403).json({ error: 'Forbidden: cannot move invoice to client outside team scope' });
            }
          }
        }
      }

      if (payload.invoice_number) {
        payload.invoice_number = String(payload.invoice_number).trim();
        const dup = await Invoice.findOne({
          _id: { $ne: oid },
          invoice_number: payload.invoice_number,
        }).lean();
        if (dup) return res.status(409).json({ error: 'invoice_number already exists' });
      }

      const updated = await Invoice.findByIdAndUpdate(
        oid,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Invoice not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Soft cancel (instead of delete), keeps linkage integrity
  async cancel(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const invoice = await Invoice.findById(oid).lean();
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        const clientDoc = await Client.findById(invoice.client).select('added_by').lean();
        if (!clientDoc) return res.status(404).json({ error: 'Client not found' });
        if (entity?.registration?.isOwner) {
          allowed = String(invoice.created_by) === String(auth.id) || String(clientDoc.added_by) === String(auth.id);
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasUpdate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.update_invoice === true) ||
              assignedRole.permissions.update_invoice === true
            );
            allowed = !!hasUpdate && (String(invoice.created_by) === String(tm.managed_by) || String(clientDoc.added_by) === String(tm.managed_by));
        }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing update_invoice or wrong scope' });
      }
      const updated = await Invoice.findByIdAndUpdate(
        oid,
        { $set: { payment_status: 'cancelled' } },
        { new: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Invoice not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default InvoiceController;