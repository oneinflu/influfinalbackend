import express from 'express';
import RateCardController from '../controllers/RateCardController.js';

const router = express.Router();

router.get('/', RateCardController.list);
router.get('/:id', RateCardController.getById);
router.post('/', RateCardController.create);
router.put('/:id', RateCardController.update);
router.delete('/:id', RateCardController.remove);

export default router;

