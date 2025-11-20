// PublicProfiles routes: wires PublicProfileController to HTTP endpoints
import express from 'express';
import multer from 'multer';
import PublicProfileController from '../controllers/PublicProfileController.js';
import { requireUser } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', PublicProfileController.list);
router.get('/:id', PublicProfileController.getById);
router.post('/', PublicProfileController.create);
router.put('/:id', PublicProfileController.update);
router.delete('/:id', PublicProfileController.remove);
// Upload cover photo for current user's public profile
router.put('/me/cover', requireUser, upload.single('cover'), PublicProfileController.updateCoverPhoto);

export default router;