// Roles routes: wires RoleController to HTTP endpoints
import express from 'express';
import RoleController from '../controllers/RoleController.js';

const router = express.Router();

router.get('/', RoleController.list);
router.get('/:id', RoleController.getById);
router.post('/', RoleController.create);
router.put('/:id', RoleController.update);
router.delete('/:id', RoleController.remove);

export default router;