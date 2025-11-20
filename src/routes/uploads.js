import express from 'express';
import UploadController from '../controllers/UploadController.js';

const router = express.Router();

// Accept raw file data for ANY content-type (image/*, video/*, etc.)
// This avoids mismatches when the client sets the file's MIME type.
router.put(
  '/portfolio',
  express.raw({ type: '*/*', limit: '100mb' }),
  UploadController.portfolio
);

export default router;