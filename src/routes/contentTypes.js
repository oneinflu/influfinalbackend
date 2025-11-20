import express from 'express';
import ContentTypeController from '../controllers/ContentTypeController.js';

const router = express.Router();

// List
router.get('/', ContentTypeController.list);
// Get by id
router.get('/:id', ContentTypeController.getById);
// Create
router.post('/', ContentTypeController.create);
// Update
router.put('/:id', ContentTypeController.update);
// Delete
router.delete('/:id', ContentTypeController.remove);

export default router;