import Otp from '../models/Otp.js';
import User from '../models/User.js';

const FAST2SMS_ENDPOINT = 'https://www.fast2sms.com/dev/bulkV2';
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function normalizePhone(phone) {
  const p = String(phone || '').trim();
  return p.replace(/[^0-9]/g, '');
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendViaFast2Sms(phone, code) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) throw new Error('FAST2SMS_API_KEY is not configured');
  const body = {
    route: 'otp',
    variables_values: code,
    numbers: phone,
  };
  const res = await fetch(FAST2SMS_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fast2SMS error (${res.status}): ${text || res.statusText}`);
  }
  return true;
}

const OtpController = {
  async send(req, res) {
    try {
      const phone = normalizePhone(req.body?.phone);
      if (!phone || phone.length < 10) return res.status(400).json({ error: 'Invalid phone' });
      const code = randomCode();
      const now = Date.now();
      const expiresAt = new Date(now + OTP_TTL_MS);
      await sendViaFast2Sms(phone, code);
      await Otp.create({ phone, code, expiresAt, lastSentAt: new Date(now), attempts: 0, status: 'sent' });
      return res.json({ ok: true, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  async verify(req, res) {
    try {
      const phone = normalizePhone(req.body?.phone);
      const code = String(req.body?.code || '').trim();
      if (!phone || !code) return res.status(400).json({ error: 'phone and code are required' });
      const otp = await Otp.findOne({ phone, status: 'sent' }).sort({ created_at: -1 }).lean();
      if (!otp) return res.status(404).json({ error: 'OTP not found' });
      if (new Date(otp.expiresAt).getTime() < Date.now()) {
        await Otp.findByIdAndUpdate(otp._id, { $set: { status: 'expired' } });
        return res.status(400).json({ error: 'OTP expired' });
      }
      if (otp.code !== code) {
        await Otp.findByIdAndUpdate(otp._id, { $inc: { attempts: 1 } });
        return res.status(401).json({ error: 'Incorrect OTP' });
      }
      await Otp.findByIdAndUpdate(otp._id, { $set: { status: 'verified' } });
      const user = await User.findOne({ 'registration.phone': phone }).select('_id').lean();
      if (user) {
        await User.findByIdAndUpdate(user._id, { $set: { 'verification.phoneVerified': true } });
      }
      return res.json({ ok: true, verified: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },

  async resend(req, res) {
    try {
      const phone = normalizePhone(req.body?.phone);
      if (!phone || phone.length < 10) return res.status(400).json({ error: 'Invalid phone' });
      const latest = await Otp.findOne({ phone }).sort({ created_at: -1 }).lean();
      const now = Date.now();
      if (latest && latest.lastSentAt && now - new Date(latest.lastSentAt).getTime() < RESEND_COOLDOWN_MS) {
        return res.status(429).json({ error: 'Resend too soon; please wait' });
      }
      const code = randomCode();
      const expiresAt = new Date(now + OTP_TTL_MS);
      await sendViaFast2Sms(phone, code);
      await Otp.create({ phone, code, expiresAt, lastSentAt: new Date(now), attempts: 0, status: 'sent' });
      return res.json({ ok: true, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  },
};

export default OtpController;

