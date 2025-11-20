// Milestones routes: wires MilestoneController to HTTP endpoints
import express from 'express';
import MilestoneController from '../controllers/MilestoneController.js';

const router = express.Router();

router.get('/', MilestoneController.list);
router.get('/:id', MilestoneController.getById);
router.post('/', MilestoneController.create);
router.put('/:id', MilestoneController.update);
router.delete('/:id', MilestoneController.remove);
router.post('/:id/attach-to-project', MilestoneController.attachToProject);
router.post('/:id/detach-from-project', MilestoneController.detachFromProject);
router.post('/:id/attach-invoice', MilestoneController.attachInvoice);

export default router;