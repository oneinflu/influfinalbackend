// Users routes: wires UserController to HTTP endpoints
import express from 'express';
import multer from 'multer';
import UserController from '../controllers/UserController.js';
import { requireUser } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', UserController.list);
router.get('/slug-available', UserController.checkSlug);
// Authenticated current user profile
router.get('/me', requireUser, UserController.me);
// Upload and update current user's avatar (Cloudinary)
router.put('/me/avatar', requireUser, upload.single('avatar'), UserController.updateAvatar);
router.get('/:id', UserController.getById);
router.post('/', UserController.create);
router.put('/:id', UserController.update);
router.delete('/:id', UserController.remove);

export default router;