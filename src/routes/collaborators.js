// Collaborators routes: wires CollaboratorController to HTTP endpoints
import express from 'express';
import CollaboratorController from '../controllers/CollaboratorController.js';

const router = express.Router();

router.get('/', CollaboratorController.list);
router.get('/:id', CollaboratorController.getById);
router.post('/', CollaboratorController.create);
router.put('/:id', CollaboratorController.update);
router.delete('/:id', CollaboratorController.remove);

export default router;