// PaymentController: CRUD operations for Payment model, updates linked Invoice status
// Exposes: list, getById, create, update, remove

import Payment from '../models/Payment.js';
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

async function recomputeInvoiceStatus(invoiceId) {
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

const PaymentController = {
  // List payments with filters
  async list(req, res) {
    try {
      // Authorization: owners or team members with view_payment; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { invoice_id, paid_by, received_by, mode, from, to } = req.query;
      const filter = {};
      // Build scope for non-admin
      let allowedInvoiceIds = null;
      let allowedClientIds = null;
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
            Object.values(assignedRole.permissions).some((g) => g && g.view_payment === true) ||
            assignedRole.permissions.view_payment === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_payment permission' });
          ownerScopeId = tm.managed_by;
        }
        // Compute allowed clients and invoices within scope
        const clients = await Client.find({ added_by: ownerScopeId }).select('_id').lean();
        allowedClientIds = clients.map((c) => c._id);
        const invoices = await Invoice.find({
          $or: [
            { created_by: ownerScopeId },
            { client: { $in: allowedClientIds } },
          ],
        }).select('_id').lean();
        allowedInvoiceIds = invoices.map((i) => i._id);
      }

      // Apply filters with validation
      if (invoice_id) {
        const oid = parseObjectId(invoice_id);
        if (!oid) return res.status(400).json({ error: 'Invalid invoice_id' });
        if (allowedInvoiceIds && !allowedInvoiceIds.some((id) => String(id) === String(oid))) {
          return res.status(403).json({ error: 'Forbidden: invoice not in scope' });
        }
        filter.invoice_id = oid;
      } else if (allowedInvoiceIds) {
        filter.invoice_id = { $in: allowedInvoiceIds };
      }

      if (paid_by) {
        const oid = parseObjectId(paid_by);
        if (!oid) return res.status(400).json({ error: 'Invalid paid_by' });
        if (allowedClientIds && !allowedClientIds.some((id) => String(id) === String(oid))) {
          return res.status(403).json({ error: 'Forbidden: paid_by client not in scope' });
        }
        filter.paid_by = oid;
      }
      if (received_by) {
        const oid = parseObjectId(received_by);
        if (!oid) return res.status(400).json({ error: 'Invalid received_by' });
        if (ownerScopeId && String(oid) !== String(ownerScopeId)) {
          return res.status(403).json({ error: 'Forbidden: received_by not in scope' });
        }
        filter.received_by = oid;
      }
      if (mode) filter.mode = mode;
      if (from || to) {
        filter.payment_date = {};
        if (from) filter.payment_date.$gte = new Date(from);
        if (to) filter.payment_date.$lte = new Date(to);
      }
      const items = await Payment.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get payment by id
  async getById(req, res) {
    try {
      // Authorization: owners or team members with view_payment; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const doc = await Payment.findById(oid).lean();
      if (!doc) return res.status(404).json({ error: 'Payment not found' });
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
            Object.values(assignedRole.permissions).some((g) => g && g.view_payment === true) ||
            assignedRole.permissions.view_payment === true
          );
          if (!hasView) return res.status(403).json({ error: 'Forbidden: missing view_payment permission' });
          ownerScopeId = tm.managed_by;
        }
        const clientDoc = await Client.findById(doc.paid_by).select('added_by').lean();
        const invoiceDoc = await Invoice.findById(doc.invoice_id).select('created_by client').lean();
        const withinScope = (
          (invoiceDoc && (String(invoiceDoc.created_by) === String(ownerScopeId))) ||
          (invoiceDoc && String(invoiceDoc.client) && clientDoc && (String(clientDoc.added_by) === String(ownerScopeId)))
        );
        if (!withinScope) return res.status(403).json({ error: 'Forbidden: payment not in scope' });
      }
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create payment and link to invoice
  async create(req, res) {
    try {
      // Authorization: owners or team members with create_payment; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = req.body || {};
      const required = ['payment_date', 'amount', 'mode', 'invoice_id', 'paid_by', 'received_by'];
      for (const f of required) {
        if (!payload[f]) return res.status(400).json({ error: `${f} is required` });
      }
      const invoiceId = parseObjectId(payload.invoice_id);
      const paidBy = parseObjectId(payload.paid_by);
      const receivedBy = parseObjectId(payload.received_by);
      if (!invoiceId) return res.status(400).json({ error: 'Invalid invoice_id' });
      if (!paidBy) return res.status(400).json({ error: 'Invalid paid_by' });
      if (!receivedBy) return res.status(400).json({ error: 'Invalid received_by' });

      // Ensure the invoice exists
      const invoice = await Invoice.findById(invoiceId).lean();
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        let ownerScopeId = null;
        if (entity?.registration?.isOwner) {
          ownerScopeId = new mongoose.Types.ObjectId(auth.id);
          const clientDoc = await Client.findById(invoice.client).select('added_by').lean();
          allowed = (String(invoice.created_by) === String(ownerScopeId)) || (clientDoc && String(clientDoc.added_by) === String(ownerScopeId));
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasCreate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.create_payment === true) ||
              assignedRole.permissions.create_payment === true
            );
            ownerScopeId = tm.managed_by;
            // Invoice must be within scope
            const clientDoc = await Client.findById(invoice.client).select('added_by').lean();
            allowed = !!hasCreate && ((String(invoice.created_by) === String(ownerScopeId)) || (clientDoc && String(clientDoc.added_by) === String(ownerScopeId)));
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing create_payment or invoice out of scope' });
        // received_by must be owner in scope
        if (String(receivedBy) !== String(ownerScopeId)) {
          return res.status(403).json({ error: 'Forbidden: received_by must be the owner in scope' });
        }
        // paid_by must be an allowed client for the owner
        const paidClient = await Client.findById(paidBy).select('added_by').lean();
        if (!paidClient || String(paidClient.added_by) !== String(ownerScopeId)) {
          return res.status(403).json({ error: 'Forbidden: paid_by client not in owner scope' });
        }
      }

      const doc = new Payment({
        payment_date: new Date(payload.payment_date),
        amount: payload.amount,
        mode: payload.mode,
        transaction_id: payload.transaction_id,
        remarks: payload.remarks,
        receipt_url: payload.receipt_url,
        is_verified: !!payload.is_verified,
        invoice_id: invoiceId,
        paid_by: paidBy,
        received_by: receivedBy,
      });
      await doc.validate();
      const saved = await doc.save();

      // Link payment to invoice
      await Invoice.findByIdAndUpdate(invoiceId, { $addToSet: { payments: saved._id } }).lean();
      await recomputeInvoiceStatus(invoiceId);
      return res.status(201).json(saved);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Update payment (and recompute invoice status)
  async update(req, res) {
    try {
      // Authorization: owners or team members with update_payment; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const payload = req.body || {};
      const current = await Payment.findById(oid).lean();
      if (!current) return res.status(404).json({ error: 'Payment not found' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        let ownerScopeId = null;
        const invoiceDoc = await Invoice.findById(current.invoice_id).select('created_by client').lean();
        if (!invoiceDoc) return res.status(404).json({ error: 'Invoice not found' });
        if (entity?.registration?.isOwner) {
          ownerScopeId = auth.id;
          allowed = (String(invoiceDoc.created_by) === String(ownerScopeId));
          if (!allowed) {
            const clientDoc = await Client.findById(invoiceDoc.client).select('user_id').lean();
            allowed = !!clientDoc && (String(clientDoc.user_id) === String(ownerScopeId));
          }
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasUpdate = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.update_payment === true) ||
              assignedRole.permissions.update_payment === true
            );
            ownerScopeId = tm.managed_by;
            const clientDoc = await Client.findById(invoiceDoc.client).select('user_id').lean();
            allowed = !!hasUpdate && ((String(invoiceDoc.created_by) === String(ownerScopeId)) || (clientDoc && String(clientDoc.user_id) === String(ownerScopeId)));
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing update_payment or payment out of scope' });
        // If changing invoice_id, ensure new invoice in scope
        if (payload.invoice_id) {
          const nextInvoice = parseObjectId(payload.invoice_id);
          if (!nextInvoice) return res.status(400).json({ error: 'Invalid invoice_id' });
          const nextInvoiceDoc = await Invoice.findById(nextInvoice).select('created_by client').lean();
          if (!nextInvoiceDoc) return res.status(404).json({ error: 'Invoice not found' });
          const nextClientDoc = await Client.findById(nextInvoiceDoc.client).select('added_by').lean();
          const inScope = (String(nextInvoiceDoc.created_by) === String(ownerScopeId)) || (nextClientDoc && String(nextClientDoc.added_by) === String(ownerScopeId));
          if (!inScope) return res.status(403).json({ error: 'Forbidden: new invoice not in scope' });
        }
        // If changing received_by, it must remain owner in scope
        if (payload.received_by) {
          const nextReceiver = parseObjectId(payload.received_by);
          if (!nextReceiver) return res.status(400).json({ error: 'Invalid received_by' });
          if (String(nextReceiver) !== String(ownerScopeId)) {
            return res.status(403).json({ error: 'Forbidden: received_by must be the owner in scope' });
          }
        }
        // If changing paid_by, it must be an allowed client
        if (payload.paid_by) {
          const nextPayer = parseObjectId(payload.paid_by);
          if (!nextPayer) return res.status(400).json({ error: 'Invalid paid_by' });
          const paidClient = await Client.findById(nextPayer).select('added_by').lean();
          if (!paidClient || String(paidClient.added_by) !== String(ownerScopeId)) {
            return res.status(403).json({ error: 'Forbidden: paid_by client not in owner scope' });
          }
        }
      }

      const updated = await Payment.findByIdAndUpdate(
        oid,
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Payment not found' });
      await recomputeInvoiceStatus(updated.invoice_id);
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  // Delete payment and unlink from invoice
  async remove(req, res) {
    try {
      // Authorization: owners or team members with delete_payment; admins bypass
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const removed = await Payment.findById(oid).lean();
      if (!removed) return res.status(404).json({ error: 'Payment not found' });

      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        let allowed = false;
        if (entity?.registration?.isOwner) {
          const ownerScopeId = auth.id;
          const inv = await Invoice.findById(removed.invoice_id).select('created_by client').lean();
          const clientDoc = inv ? await Client.findById(inv.client).select('added_by').lean() : null;
          allowed = inv && ((String(inv.created_by) === String(ownerScopeId)) || (clientDoc && String(clientDoc.added_by) === String(ownerScopeId)));
        } else {
          const email = entity?.registration?.email;
          const tm = email ? await TeamMember.findOne({ email, status: 'active' }).select('role managed_by').lean() : null;
          if (tm && tm.role && tm.managed_by) {
            const assignedRole = await Role.findById(tm.role).select('permissions').lean();
            const hasDelete = assignedRole && assignedRole.permissions && (
              Object.values(assignedRole.permissions).some((g) => g && g.delete_payment === true) ||
              assignedRole.permissions.delete_payment === true
            );
            const inv = await Invoice.findById(removed.invoice_id).select('created_by client').lean();
            const clientDoc = inv ? await Client.findById(inv.client).select('added_by').lean() : null;
            allowed = !!hasDelete && inv && ((String(inv.created_by) === String(tm.managed_by)) || (clientDoc && String(clientDoc.added_by) === String(tm.managed_by)));
          }
        }
        if (!allowed) return res.status(403).json({ error: 'Forbidden: missing delete_payment or payment out of scope' });
      }

      // Perform deletion and cleanup
      await Payment.findByIdAndDelete(oid).lean();
      await Invoice.findByIdAndUpdate(removed.invoice_id, { $pull: { payments: removed._id } }).lean();
      await recomputeInvoiceStatus(removed.invoice_id);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default PaymentController;