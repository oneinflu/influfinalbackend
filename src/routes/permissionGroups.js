// PermissionGroups routes: wires PermissionGroupController to HTTP endpoints
import express from 'express';
import PermissionGroupController from '../controllers/PermissionGroupController.js';

const router = express.Router();

router.get('/', PermissionGroupController.list);
router.get('/:id', PermissionGroupController.getById);
router.post('/', PermissionGroupController.create);
router.put('/:id', PermissionGroupController.update);
router.delete('/:id', PermissionGroupController.remove);

export default router;