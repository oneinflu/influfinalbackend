// Leads routes: wires LeadController to HTTP endpoints
import express from 'express';
import LeadController from '../controllers/LeadController.js';

const router = express.Router();

router.get('/', LeadController.list);
router.get('/user/:userId', LeadController.getByUserId);
router.get('/:id', LeadController.getById);
router.post('/', LeadController.create);
router.put('/:id', LeadController.update);
router.delete('/:id', LeadController.remove);

export default router;
