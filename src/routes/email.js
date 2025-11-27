import express from 'express';
import EmailController from '../controllers/EmailController.js';

const router = express.Router();

router.post('/welcome', EmailController.sendWelcome);

export default router;

