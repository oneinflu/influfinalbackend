// AuthController: issues JWT for admin and user logins
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admin.js';
import User from '../models/User.js';

function sanitizeAdmin(admin) {
  const { password, __v, ...rest } = admin;
  return rest;
}

function sanitizeUser(user) {
  const { __v, ...rest } = user;
  return rest;
}

function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
  return jwt.sign(payload, secret, { expiresIn });
}

async function verifyPassword(plain, hashedOrPlain) {
  // If hashedOrPlain looks like a bcrypt hash, use bcrypt compare; otherwise plain equality
  if (typeof hashedOrPlain === 'string' && hashedOrPlain.startsWith('$2')) {
    try { return await bcrypt.compare(plain, hashedOrPlain); } catch { return false; }
  }
  return plain === hashedOrPlain;
}

const AuthController = {
  // POST /api/auth/admin/login
  async loginAdmin(req, res) {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
      const admin = await Admin.findOne({ email: String(email).toLowerCase() }).lean();
      if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
      const ok = await verifyPassword(password, admin.password);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      const token = signToken({ type: 'admin', sub: admin._id, role: admin.role });
      return res.json({ token, admin: sanitizeAdmin(admin) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // POST /api/auth/user/login
  async loginUser(req, res) {
    try {
      const { email, password } = req.body || {};
      if (!email) return res.status(400).json({ error: 'email is required' });
      const doc = await User.findOne({ 'registration.email': String(email).toLowerCase() }).lean();
      if (!doc) return res.status(401).json({ error: 'Invalid credentials' });

      // If a passwordHash exists, require password validation; else allow email-only fallback
      if (doc.passwordHash) {
        if (!password) return res.status(400).json({ error: 'password is required' });
        const ok = await verifyPassword(String(password), String(doc.passwordHash));
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = signToken({ type: 'user', sub: doc._id });
      return res.json({ token, user: sanitizeUser(doc) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // PUT /api/auth/user/password
  async changeUserPassword(req, res) {
    try {
      const userAuth = req.user;
      const id = userAuth?._id || userAuth?.id;
      if (!id) return res.status(401).json({ error: 'Unauthorized' });
      const { currentPassword, newPassword } = req.body || {};
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
      }
      const doc = await User.findById(id).select('passwordHash').lean();
      if (!doc) return res.status(404).json({ error: 'User not found' });
      if (doc.passwordHash) {
        if (!currentPassword) return res.status(400).json({ error: 'currentPassword is required' });
        const ok = await verifyPassword(String(currentPassword), String(doc.passwordHash));
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
      }
      const nextHash = await bcrypt.hash(String(newPassword), 10);
      const updated = await User.findByIdAndUpdate(id, { $set: { passwordHash: nextHash } }, { new: true }).select('_id').lean();
      if (!updated) return res.status(404).json({ error: 'User not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
};

export default AuthController;