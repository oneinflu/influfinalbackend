// Collaborators routes: wires CollaboratorController to HTTP endpoints
import express from 'express';
import CollaboratorController from '../controllers/CollaboratorController.js';

const router = express.Router();

router.get('/', CollaboratorController.list);
router.get('/user/:userId', CollaboratorController.getByUserId);
router.get('/:id', CollaboratorController.getById);
router.post('/', CollaboratorController.create);
router.put('/:id', CollaboratorController.update);
router.put('/:id/profile-icon', CollaboratorController.updateProfileIcon);
router.put('/:id/samples', CollaboratorController.updateSamples);
router.put('/:id/role-profile', CollaboratorController.updateRoleProfile);
router.delete('/:id', CollaboratorController.remove);

export default router;
