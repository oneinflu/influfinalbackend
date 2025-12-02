// Invoices routes: wires InvoiceController to HTTP endpoints
import express from 'express';
import InvoiceController from '../controllers/InvoiceController.js';

const router = express.Router();

router.get('/', InvoiceController.list);
router.get('/user/:userId', InvoiceController.getByUserId);
router.get('/:id', InvoiceController.getById);
router.post('/', InvoiceController.create);
router.put('/:id', InvoiceController.update);
router.post('/:id/cancel', InvoiceController.cancel);

export default router;
