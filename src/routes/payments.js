// Payments routes: wires PaymentController to HTTP endpoints
import express from 'express';
import PaymentController from '../controllers/PaymentController.js';

const router = express.Router();

router.get('/', PaymentController.list);
router.get('/:id', PaymentController.getById);
router.post('/', PaymentController.create);
router.put('/:id', PaymentController.update);
router.delete('/:id', PaymentController.remove);

export default router;