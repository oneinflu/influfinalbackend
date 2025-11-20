// Admins routes: wires AdminController to HTTP endpoints
import express from 'express';
import AdminController from '../controllers/AdminController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', AdminController.list);
router.get('/me', requireAdmin, AdminController.me);
router.get('/:id', AdminController.getById);
router.post('/', AdminController.create);
router.put('/:id', AdminController.update);
router.delete('/:id', AdminController.remove);

export default router;