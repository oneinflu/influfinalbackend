// Categories routes: wires CategoryController to HTTP endpoints
import express from 'express';
import CategoryController from '../controllers/CategoryController.js';

const router = express.Router();

router.get('/', CategoryController.list);
router.get('/:id', CategoryController.getById);
router.post('/', CategoryController.create);
router.put('/:id', CategoryController.update);
router.delete('/:id', CategoryController.remove);

export default router;