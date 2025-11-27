import nodemailer from 'nodemailer';

const EmailController = {
  async sendWelcome(req, res) {
    try {
      const to = req.body?.to || {};
      const toAddress = String(to.address || '').trim();
      const toName = String(to.name || '').trim() || toAddress;
      if (!toAddress) return res.status(400).json({ error: 'to.address is required' });
      const fromAddress = String(process.env.ZEPTO_FROM_ADDRESS || '').trim();
      const fromName = String(process.env.ZEPTO_FROM_NAME || 'noreply');
      if (!fromAddress) return res.status(400).json({ error: 'ZEPTO_FROM_ADDRESS is not configured' });
      const subject = String(req.body?.subject || 'Welcome to INFLU');
      const htmlbody = String(
        req.body?.htmlbody || `<div><b>Welcome, ${toName}.</b></div>`
      );
      const host = String(process.env.SMTP_HOST || 'smtp.zeptomail.in');
      const port = Number(process.env.SMTP_PORT || 587);
      const user = String(process.env.SMTP_USER).trim();
      const pass = String(process.env.SMTP_PASS).trim();
      if (!user || !pass) return res.status(400).json({ error: 'SMTP_USER/SMTP_PASS are required' });
      const transport = nodemailer.createTransport({ host, port, auth: { user, pass } });
      await transport.sendMail({ from: `${fromName} <${fromAddress}>`, to: `${toName} <${toAddress}>`, subject, html: htmlbody });
      return res.json({ ok: true });
    } catch (err) {
      const msg = (err && (err.message || (err.details && err.details[0]?.message) || (err.error && err.error.message))) || 'Failed to send email';
      return res.status(400).json({ error: String(msg) });
    }
  },
};

export default EmailController;
