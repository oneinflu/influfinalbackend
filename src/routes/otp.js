import express from 'express';
import OtpController from '../controllers/OtpController.js';

const router = express.Router();

router.post('/send', OtpController.send);
router.post('/verify', OtpController.verify);
router.post('/resend', OtpController.resend);

export default router;

