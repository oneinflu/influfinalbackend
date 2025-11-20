// Services routes: wires ServiceController to HTTP endpoints
import express from 'express';
import ServiceController from '../controllers/ServiceController.js';

const router = express.Router();

router.get('/', ServiceController.list);
router.get('/:id', ServiceController.getById);
router.post('/', ServiceController.create);
router.put('/:id', ServiceController.update);
router.delete('/:id', ServiceController.remove);

export default router;