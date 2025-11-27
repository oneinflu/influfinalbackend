import express from 'express';
import QuotationController from '../controllers/QuotationController.js';

const router = express.Router();

router.get('/', QuotationController.list);
router.get('/:id', QuotationController.getById);
router.post('/', QuotationController.create);
router.put('/:id', QuotationController.update);
router.delete('/:id', QuotationController.remove);

export default router;

