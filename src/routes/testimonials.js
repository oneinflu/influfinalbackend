// Testimonials routes: wires TestimonialController to HTTP endpoints
import express from 'express';
import TestimonialController from '../controllers/TestimonialController.js';

const router = express.Router();

router.get('/', TestimonialController.list);
router.get('/user/:userId', TestimonialController.getByUserId);
router.get('/:id', TestimonialController.getById);
router.post('/', TestimonialController.create);
router.put('/:id', TestimonialController.update);
router.delete('/:id', TestimonialController.remove);

export default router;
