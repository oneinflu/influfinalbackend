// Clients routes: wires ClientController to HTTP endpoints
import express from 'express';
import multer from 'multer';
import ClientController from '../controllers/ClientController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', ClientController.list);
router.get('/:id', ClientController.getById);
router.get('/user/:userId', ClientController.getByUserId);
// Accept optional logo file via multipart form-data
router.post('/', upload.single('logo'), ClientController.create);
router.put('/:id', upload.single('logo'), ClientController.update);
router.delete('/:id', ClientController.remove);

export default router;
