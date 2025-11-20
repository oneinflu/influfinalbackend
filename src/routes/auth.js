// Auth routes: admin and user login endpoints
import express from 'express';
import AuthController from '../controllers/AuthController.js';
import { requireUser } from '../middleware/auth.js';

const router = express.Router();

// Admin login: returns JWT token and admin info
router.post('/admin/login', AuthController.loginAdmin);

// User login (optional stub): returns JWT token and user info
router.post('/user/login', AuthController.loginUser);

// Secure password change for authenticated user
router.put('/user/password', requireUser, AuthController.changeUserPassword);

export default router;