// Projects routes: wires ProjectController to HTTP endpoints
import express from 'express';
import ProjectController from '../controllers/ProjectController.js';

const router = express.Router();

router.get('/', ProjectController.list);
router.get('/user/:userId', ProjectController.getByUserId);
router.get('/:id', ProjectController.getById);
router.post('/', ProjectController.create);
router.put('/:id', ProjectController.update);
router.delete('/:id', ProjectController.remove);

export default router;
