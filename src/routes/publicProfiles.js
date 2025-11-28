// PublicProfiles routes: wires PublicProfileController to HTTP endpoints
import express from 'express';
import PublicProfileController from '../controllers/PublicProfileController.js';

const router = express.Router();

router.get('/', PublicProfileController.list);
router.get('/slug/:slug', PublicProfileController.getBySlug);
router.get('/:id', PublicProfileController.getById);
router.post('/', PublicProfileController.create);
router.put('/:id', PublicProfileController.update);
router.delete('/:id', PublicProfileController.remove);
router.post('/:id/publish', PublicProfileController.publish);
router.post('/:id/unpublish', PublicProfileController.unpublish);
router.post('/:id/view', PublicProfileController.incrementView);

export default router;
