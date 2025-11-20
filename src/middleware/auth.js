import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import User from '../models/User.js';

function getTokenFromHeader(req) {
  const header = req.headers?.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export async function getAuthFromRequest(req) {
  const token = getTokenFromHeader(req);
  if (!token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return null;
  }
  const type = payload.type === 'admin' ? 'admin' : 'user';
  const id = payload.sub;
  if (!id) return null;
  let entity = null;
  if (type === 'admin') {
    entity = await Admin.findById(id).lean();
    if (!entity || entity.status === 'banned' || entity.status === 'inactive') return null;
  } else {
    entity = await User.findById(id).lean();
    if (!entity || entity.meta?.status === 'banned') return null;
  }
  return { type, id, token, entity };
}

export async function authenticate(req, res, next) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    req.auth = auth;
    if (auth.type === 'admin') req.admin = auth.entity;
    else req.user = auth.entity;
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function requireAdmin(req, res, next) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth || auth.type !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.auth = auth;
    req.admin = auth.entity;
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function requireUser(req, res, next) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth || auth.type !== 'user') return res.status(403).json({ error: 'User only' });
    req.auth = auth;
    req.user = auth.entity;
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}