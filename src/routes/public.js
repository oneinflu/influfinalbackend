import express from 'express';
import PublicController from '../controllers/PublicController.js';

const router = express.Router();

// Public, no auth needed
router.get('/profile/:slug', PublicController.profileBySlug);

export default router;