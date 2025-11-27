// InvoiceController: CRUD operations for Invoice model with validation and soft cancel
// Exposes: list, getById, create, update, cancel

import Invoice from '../models/Invoice.js';
import { getAuthFromRequest } from '../middleware/auth.js';
import mongoose from 'mongoose';

function parseObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

async function ensureOwnerOrAdmin(req) {
  const auth = await getAuthFromRequest(req);
  if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
    return { ok: false };
  }
  return { ok: true, auth };
}

const InvoiceController = {
  // List invoices with filters
  async list(req, res) {
    try {
      const { ok, auth } = await ensureOwnerOrAdmin(req);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      const { clientId, createdBy, status, from, to, q } = req.query;
      const filter = {};

      if (auth.type !== 'admin') {
        const ownerId = new mongoose.Types.ObjectId(auth.id);
        filter.createdBy = ownerId;
        if (createdBy) {
          const oid = parseObjectId(createdBy);
          if (!oid) return res.status(400).json({ error: 'Invalid createdBy' });
          if (String(oid) !== String(ownerId)) return res.status(403).json({ error: 'Forbidden: createdBy not owner' });
          filter.createdBy = oid;
        }
      } else if (createdBy) {
        const oid = parseObjectId(createdBy);
        if (!oid) return res.status(400).json({ error: 'Invalid createdBy' });
        filter.createdBy = oid;
      }

      if (clientId) {
        const oid = parseObjectId(clientId);
        if (!oid) return res.status(400).json({ error: 'Invalid clientId' });
        filter.clientId = oid;
      }
      if (status) filter.status = status;
      if (from || to) {
        filter.issuedAt = {};
        if (from) filter.issuedAt.$gte = new Date(from);
        if (to) filter.issuedAt.$lte = new Date(to);
      }
      if (q) filter.invoiceNo = { $regex: q, $options: 'i' };

      const items = await Invoice.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get invoice by id
  async getById(req, res) {
    try {
      const { ok, auth } = await ensureOwnerOrAdmin(req);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const invoice = await Invoice.findById(oid).lean();
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (auth.type !== 'admin') {
        if (String(invoice.createdBy) !== String(auth.id)) {
          return res.status(403).json({ error: 'Forbidden: invoice not in owner scope' });
        }
      }
      return res.json(invoice);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Create invoice
  async create(req, res) {
    try {
      const { ok, auth } = await ensureOwnerOrAdmin(req);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      const payload = req.body || {};
      const required = ['invoiceNo', 'clientId', 'issuedTo'];
      for (const f of required) {
        if (!payload[f]) return res.status(400).json({ error: `${f} is required` });
      }
      const createdBy = new mongoose.Types.ObjectId(auth.type === 'admin' ? (payload.createdBy || auth.id) : auth.id);
      const clientId = parseObjectId(payload.clientId);
      const projectId = payload.projectId ? parseObjectId(payload.projectId) : undefined;
      const quotationId = payload.quotationId ? parseObjectId(payload.quotationId) : undefined;
      if (!clientId) return res.status(400).json({ error: 'Invalid clientId' });
      if (payload.projectId && !projectId) return res.status(400).json({ error: 'Invalid projectId' });
      if (payload.quotationId && !quotationId) return res.status(400).json({ error: 'Invalid quotationId' });

      // Owner-only scope already enforced; createdBy set to auth.id for owners

      const dup = await Invoice.findOne({ invoiceNo: String(payload.invoiceNo).trim() }).lean();
      if (dup) return res.status(409).json({ error: 'invoiceNo already exists' });

      const doc = new Invoice({
        invoiceNo: String(payload.invoiceNo).trim(),
        clientId,
        issuedTo: payload.issuedTo,
        currency: payload.currency || 'INR',
        items: Array.isArray(payload.items) ? payload.items : [],
        taxes: Array.isArray(payload.taxes) ? payload.taxes : [],
        total: payload.total ?? 0,
        payments: Array.isArray(payload.payments) ? payload.payments : [],
        status: payload.status || 'draft',
        issuedAt: payload.issuedAt ? new Date(payload.issuedAt) : null,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        taxInclusive: !!payload.taxInclusive,
        notes: payload.notes ?? null,
        terms: payload.terms ?? null,
        pdfUrl: payload.pdfUrl ?? null,
        createdBy,
        updatedBy: null,
        ledgerEntryId: payload.ledgerEntryId ?? null,
        isActive: payload.isActive !== undefined ? !!payload.isActive : true,
        isDeleted: false,
        meta: payload.meta ?? {},
        projectId,
        quotationId,
        // Backward fields for compatibility
        invoice_number: String(payload.invoiceNo).trim(),
        issue_date: payload.issuedAt ? new Date(payload.issuedAt) : null,
        due_date: payload.dueDate ? new Date(payload.dueDate) : null,
        created_by: createdBy,
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
      const { ok, auth } = await ensureOwnerOrAdmin(req);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const payload = req.body || {};

      // Verify current document and scope
      const current = await Invoice.findById(oid).lean();
      if (!current) return res.status(404).json({ error: 'Invoice not found' });
      if (auth.type !== 'admin') {
        if (String(current.createdBy) !== String(auth.id)) {
          return res.status(403).json({ error: 'Forbidden: invoice not in owner scope' });
        }
      }

      if (payload.invoiceNo) {
        payload.invoiceNo = String(payload.invoiceNo).trim();
        const dup = await Invoice.findOne({ _id: { $ne: oid }, invoiceNo: payload.invoiceNo }).lean();
        if (dup) return res.status(409).json({ error: 'invoiceNo already exists' });
      }

      const updated = await Invoice.findByIdAndUpdate(
        oid,
        { $set: {
          // New fields
          ...(payload.invoiceNo != null ? { invoiceNo: payload.invoiceNo, invoice_number: payload.invoiceNo } : {}),
          ...(payload.clientId ? { clientId: parseObjectId(payload.clientId) } : {}),
          ...(payload.issuedTo ? { issuedTo: payload.issuedTo } : {}),
          ...(payload.currency ? { currency: payload.currency } : {}),
          ...(Array.isArray(payload.items) ? { items: payload.items } : {}),
          ...(Array.isArray(payload.taxes) ? { taxes: payload.taxes } : {}),
          ...(payload.total != null ? { total: payload.total } : {}),
          ...(Array.isArray(payload.payments) ? { payments: payload.payments } : {}),
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.issuedAt ? { issuedAt: new Date(payload.issuedAt), issue_date: new Date(payload.issuedAt) } : {}),
          ...(payload.dueDate ? { dueDate: new Date(payload.dueDate), due_date: new Date(payload.dueDate) } : {}),
          ...(payload.taxInclusive != null ? { taxInclusive: !!payload.taxInclusive } : {}),
          ...(payload.notes != null ? { notes: payload.notes } : {}),
          ...(payload.terms != null ? { terms: payload.terms } : {}),
          ...(payload.pdfUrl != null ? { pdfUrl: payload.pdfUrl, pdf_url: payload.pdfUrl } : {}),
          ...(payload.updatedBy ? { updatedBy: parseObjectId(payload.updatedBy) } : {}),
          ...(payload.ledgerEntryId ? { ledgerEntryId: parseObjectId(payload.ledgerEntryId) } : {}),
          ...(payload.isActive != null ? { isActive: !!payload.isActive } : {}),
          ...(payload.isDeleted != null ? { isDeleted: !!payload.isDeleted } : {}),
          ...(payload.meta ? { meta: payload.meta } : {}),
          ...(payload.projectId ? { projectId: parseObjectId(payload.projectId), project: parseObjectId(payload.projectId) } : {}),
          ...(payload.quotationId ? { quotationId: parseObjectId(payload.quotationId) } : {}),
        } },
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
      const { ok, auth } = await ensureOwnerOrAdmin(req);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const invoice = await Invoice.findById(oid).lean();
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (auth.type !== 'admin') {
        if (String(invoice.createdBy) !== String(auth.id)) {
          return res.status(403).json({ error: 'Forbidden: invoice not in owner scope' });
        }
      }
      const updated = await Invoice.findByIdAndUpdate(
        oid,
        { $set: { status: 'cancelled', payment_status: 'cancelled' } },
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
