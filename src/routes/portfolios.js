// Portfolios routes: wires PortfolioController to HTTP endpoints
import express from 'express';
import PortfolioController from '../controllers/PortfolioController.js';

const router = express.Router();

router.get('/', PortfolioController.list);
router.get('/:id', PortfolioController.getById);
router.post('/', PortfolioController.create);
router.put('/:id', PortfolioController.update);
router.delete('/:id', PortfolioController.remove);

export default router;