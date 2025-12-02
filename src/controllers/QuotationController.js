import mongoose from 'mongoose';
import Quotation from '../models/Quotation.js';
import Client from '../models/Client.js';
import Service from '../models/Service.js';
import RateCard from '../models/RateCard.js';
import { getAuthFromRequest } from '../middleware/auth.js';

function parseObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

const QuotationController = {
  async list(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { client_id, service_id, rate_card_id, is_active, from, to, q } = req.query;
      const filter = {};
      if (client_id) {
        const oid = parseObjectId(client_id);
        if (!oid) return res.status(400).json({ error: 'Invalid client_id' });
        filter.clientId = oid;
      }
      if (service_id) {
        const oid = parseObjectId(service_id);
        if (!oid) return res.status(400).json({ error: 'Invalid service_id' });
        filter.serviceId = oid;
      }
      if (rate_card_id) {
        const oid = parseObjectId(rate_card_id);
        if (!oid) return res.status(400).json({ error: 'Invalid rate_card_id' });
        filter.rateCardId = oid;
      }
      if (is_active === 'true') filter.isActive = true;
      else if (is_active === 'false') filter.isActive = false;
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { paymentTerms: { $regex: q, $options: 'i' } },
          { deliverables: { $regex: q, $options: 'i' } },
        ];
      }
      const items = await Quotation.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const doc = await Quotation.findById(oid).lean();
      if (!doc) return res.status(404).json({ error: 'Quotation not found' });
      return res.json(doc);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Get quotations by owner userId via client/service/rateCard ownership
  async getByUserId(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { userId } = req.params;
      const ownerId = parseObjectId(userId);
      if (!ownerId) return res.status(400).json({ error: 'Invalid userId' });
      if (auth.type !== 'admin' && String(ownerId) !== String(auth.id)) {
        return res.status(403).json({ error: 'Forbidden: userId not owner' });
      }

      const [clients, services, rateCards] = await Promise.all([
        Client.find({ added_by: ownerId }).select('_id').lean(),
        Service.find({ user_id: ownerId }).select('_id').lean(),
        RateCard.find({ ownerRef: ownerId }).select('_id').lean(),
      ]);
      const clientIds = clients.map((c) => c._id);
      const serviceIds = services.map((s) => s._id);
      const rateCardIds = rateCards.map((r) => r._id);

      const items = await Quotation.find({
        $or: [
          { clientId: { $in: clientIds } },
          { serviceId: { $in: serviceIds } },
          { rateCardId: { $in: rateCardIds } },
        ],
      }).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  async create(req, res) {
      try {
        const auth = await getAuthFromRequest(req);
        if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        const payload = req.body || {};
        const required = ['clientId', 'serviceId', 'rateCardId', 'quantity', 'totalCost'];
        for (const f of required) {
          if (payload[f] === undefined || payload[f] === null) return res.status(400).json({ error: `${f} is required` });
        }
        const clientOid = parseObjectId(payload.clientId);
        const serviceOid = parseObjectId(payload.serviceId);
        const rateCardOid = parseObjectId(payload.rateCardId);
        if (!clientOid) return res.status(400).json({ error: 'Invalid clientId' });
        if (!serviceOid) return res.status(400).json({ error: 'Invalid serviceId' });
        if (!rateCardOid) return res.status(400).json({ error: 'Invalid rateCardId' });
        const [client, service, rateCard] = await Promise.all([
          Client.findById(clientOid).select('_id').lean(),
          Service.findById(serviceOid).select('_id').lean(),
          RateCard.findById(rateCardOid).select('_id').lean(),
        ]);
        if (!client) return res.status(404).json({ error: 'Client not found' });
        if (!service) return res.status(404).json({ error: 'Service not found' });
        if (!rateCard) return res.status(404).json({ error: 'RateCard not found' });
        const doc = new Quotation({
          clientId: clientOid,
          serviceId: serviceOid,
          rateCardId: rateCardOid,
          deliverables: Array.isArray(payload.deliverables) ? payload.deliverables : [],
          quantity: Math.max(1, Number(payload.quantity)),
          totalCost: Math.round(Number(payload.totalCost)),
          taxes: payload.taxes ?? {},
          paymentTerms: Array.isArray(payload.paymentTerms) ? payload.paymentTerms : [],
          validity: payload.validity ?? null,
          addOns: Array.isArray(payload.addOns) ? payload.addOns : [],
          isActive: payload.isActive !== undefined ? !!payload.isActive : true,
        });
        await doc.validate();
        const saved = await doc.save();
        return res.status(201).json(saved);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
  },

  async update(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const payload = req.body || {};
      const update = {};
      if (payload.clientId) {
        const cid = parseObjectId(payload.clientId);
        if (!cid) return res.status(400).json({ error: 'Invalid clientId' });
        update.clientId = cid;
      }
      if (payload.serviceId) {
        const sid = parseObjectId(payload.serviceId);
        if (!sid) return res.status(400).json({ error: 'Invalid serviceId' });
        update.serviceId = sid;
      }
      if (payload.rateCardId) {
        const rid = parseObjectId(payload.rateCardId);
        if (!rid) return res.status(400).json({ error: 'Invalid rateCardId' });
        update.rateCardId = rid;
      }
      if (Array.isArray(payload.deliverables)) update.deliverables = payload.deliverables.map((s) => String(s));
      if (payload.quantity !== undefined) update.quantity = Math.max(1, Number(payload.quantity));
      if (payload.totalCost !== undefined) update.totalCost = Math.round(Number(payload.totalCost));
      if (payload.taxes !== undefined) update.taxes = payload.taxes ?? {};
      if (payload.paymentTerms !== undefined) update.paymentTerms = Array.isArray(payload.paymentTerms) ? payload.paymentTerms : [];
      if (payload.validity !== undefined) update.validity = payload.validity ?? null;
      if (Array.isArray(payload.addOns)) update.addOns = payload.addOns.map((a) => ({ ...a, price: Math.round(Number(a.price)), name: String(a.name || '').trim() }));
      if (payload.isActive !== undefined) update.isActive = !!payload.isActive;
      const updated = await Quotation.findByIdAndUpdate(oid, { $set: update }, { new: true, runValidators: true }).lean();
      if (!updated) return res.status(404).json({ error: 'Quotation not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && !(auth.type === 'user' && auth.entity?.registration?.isOwner))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const removed = await Quotation.findByIdAndDelete(oid).lean();
      if (!removed) return res.status(404).json({ error: 'Quotation not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default QuotationController;
