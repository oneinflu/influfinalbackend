// TeamMembers routes: wires TeamMemberController to HTTP endpoints
import express from 'express';
import TeamMemberController from '../controllers/TeamMemberController.js';

const router = express.Router();

router.get('/', TeamMemberController.list);
router.get('/user/:userId', TeamMemberController.getByUserId);
router.get('/:id', TeamMemberController.getById);
router.post('/', TeamMemberController.create);
router.put('/:id', TeamMemberController.update);
router.delete('/:id', TeamMemberController.remove);

export default router;
