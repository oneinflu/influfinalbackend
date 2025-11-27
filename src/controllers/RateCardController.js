import RateCard from '../models/RateCard.js';
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

const RateCardController = {
  async list(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { service_id, owner_type, owner_ref, visibility, is_active, currency, min_price, max_price, q, from, to } = req.query;
      const filter = {};
      if (service_id) {
        const oid = parseObjectId(service_id);
        if (!oid) return res.status(400).json({ error: 'Invalid service_id' });
        filter.serviceId = oid;
      }
      if (owner_type) filter.ownerType = String(owner_type);
      if (owner_ref) {
        const oid = parseObjectId(owner_ref);
        if (!oid) return res.status(400).json({ error: 'Invalid owner_ref' });
        filter.ownerRef = oid;
      }
      if (visibility) filter.visibility = String(visibility);
      if (currency) filter.currency = String(currency).trim();
      if (is_active === 'true') filter.isActive = true;
      else if (is_active === 'false') filter.isActive = false;
      if (min_price || max_price) {
        filter.price = {};
        if (min_price) filter.price.$gte = Math.round(Number(min_price));
        if (max_price) filter.price.$lte = Math.round(Number(max_price));
      }
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }
      if (q) {
        filter.$or = [
          { title: { $regex: q, $options: 'i' } },
          { notes: { $regex: q, $options: 'i' } },
        ];
      }
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          const ownerId = new mongoose.Types.ObjectId(auth.id);
          if (!visibility) {
            filter.$or = (filter.$or || []).concat([
              { visibility: 'public', isActive: true },
              { ownerRef: ownerId },
            ]);
          } else {
            if (visibility === 'private' || visibility === 'internal') {
              filter.ownerRef = ownerId;
            }
          }
        } else {
          filter.visibility = 'public';
          filter.isActive = true;
        }
      }
      const items = await RateCard.find(filter).lean();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.params;
      const oid = parseObjectId(id);
      if (!oid) return res.status(400).json({ error: 'Invalid id' });
      const doc = await RateCard.findById(oid).lean();
      if (!doc) return res.status(404).json({ error: 'RateCard not found' });
      if (auth.type !== 'admin') {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner) {
          const ownerId = new mongoose.Types.ObjectId(auth.id);
          const allowed = doc.visibility === 'public' || String(doc.ownerRef) === String(ownerId);
          if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        } else {
          if (!(doc.visibility === 'public' && doc.isActive === true)) {
            return res.status(403).json({ error: 'Forbidden' });
          }
        }
      }
      return res.json(doc);
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
      if (!payload.serviceId) return res.status(400).json({ error: 'serviceId is required' });
      if (!payload.ownerType) return res.status(400).json({ error: 'ownerType is required' });
      if (!payload.price && payload.price !== 0) return res.status(400).json({ error: 'price is required' });
      const serviceOid = parseObjectId(payload.serviceId);
      if (!serviceOid) return res.status(400).json({ error: 'Invalid serviceId' });
      const svc = await Service.findById(serviceOid).select('_id').lean();
      if (!svc) return res.status(404).json({ error: 'Service not found' });
      let ownerRefOid = payload.ownerRef ? parseObjectId(payload.ownerRef) : null;
      if (auth.type === 'admin') {
        if (!ownerRefOid) return res.status(400).json({ error: 'ownerRef is required' });
      } else {
        const ownerId = new mongoose.Types.ObjectId(auth.id);
        if (ownerRefOid && String(ownerRefOid) !== String(ownerId)) {
          return res.status(403).json({ error: 'Forbidden: ownerRef mismatch' });
        }
        ownerRefOid = ownerId;
      }
      const doc = new RateCard({
        serviceId: serviceOid,
        ownerType: String(payload.ownerType),
        ownerRef: ownerRefOid,
        title: payload.title ?? null,
        price: Math.round(Number(payload.price)),
        currency: payload.currency ? String(payload.currency).trim() : undefined,
        deliveryDays: payload.deliveryDays ?? null,
        revisions: payload.revisions ?? null,
        addons: Array.isArray(payload.addons) ? payload.addons : [],
        visibility: payload.visibility ?? 'public',
        isActive: payload.isActive !== undefined ? !!payload.isActive : true,
        meta: payload.meta ?? {},
        notes: payload.notes ?? null,
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
      const current = await RateCard.findById(oid).select(['ownerRef']).lean();
      if (!current) return res.status(404).json({ error: 'RateCard not found' });
      if (auth.type !== 'admin') {
        const ownerId = new mongoose.Types.ObjectId(auth.id);
        if (String(current.ownerRef) !== String(ownerId)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
      const payload = req.body || {};
      const update = {};
      if (payload.serviceId) {
        const sid = parseObjectId(payload.serviceId);
        if (!sid) return res.status(400).json({ error: 'Invalid serviceId' });
        update.serviceId = sid;
      }
      if (payload.ownerType) update.ownerType = String(payload.ownerType);
      if (payload.ownerRef) {
        if (auth.type === 'admin') {
          const orf = parseObjectId(payload.ownerRef);
          if (!orf) return res.status(400).json({ error: 'Invalid ownerRef' });
          update.ownerRef = orf;
        } else {
          return res.status(403).json({ error: 'Forbidden: cannot change ownerRef' });
        }
      }
      if (payload.title !== undefined) update.title = payload.title ?? null;
      if (payload.price !== undefined) update.price = Math.round(Number(payload.price));
      if (payload.currency) update.currency = String(payload.currency).trim();
      if (payload.deliveryDays !== undefined) update.deliveryDays = payload.deliveryDays ?? null;
      if (payload.revisions !== undefined) update.revisions = payload.revisions ?? null;
      if (Array.isArray(payload.addons)) update.addons = payload.addons.map((a) => ({ ...a, price: Math.round(Number(a.price)), name: String(a.name || '').trim() }));
      if (payload.visibility) update.visibility = String(payload.visibility);
      if (payload.isActive !== undefined) update.isActive = !!payload.isActive;
      if (payload.meta !== undefined) update.meta = payload.meta ?? {};
      if (payload.notes !== undefined) update.notes = payload.notes ?? null;
      const updated = await RateCard.findByIdAndUpdate(oid, { $set: update }, { new: true, runValidators: true }).lean();
      if (!updated) return res.status(404).json({ error: 'RateCard not found' });
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
      const current = await RateCard.findById(oid).select(['ownerRef']).lean();
      if (!current) return res.status(404).json({ error: 'RateCard not found' });
      if (auth.type !== 'admin') {
        const ownerId = new mongoose.Types.ObjectId(auth.id);
        if (String(current.ownerRef) !== String(ownerId)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
      const removed = await RateCard.findByIdAndDelete(oid).lean();
      if (!removed) return res.status(404).json({ error: 'RateCard not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default RateCardController;

