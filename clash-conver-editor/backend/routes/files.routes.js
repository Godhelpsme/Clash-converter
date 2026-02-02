import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validate.middleware.js';
import { filenameParamsSchema, saveFileSchema } from '../validators/file.validator.js';
import {
  listFiles,
  uploadMiddleware,
  uploadFile,
  readFile,
  saveFile,
  deleteFile
} from '../controllers/files.controller.js';

const router = Router();

router.get('/list', authMiddleware, listFiles);
router.post('/upload', authMiddleware, uploadMiddleware, uploadFile);
router.get('/read/:filename(*)', authMiddleware, validateParams(filenameParamsSchema), readFile);
router.post('/save', authMiddleware, validateBody(saveFileSchema), saveFile);
router.delete('/:filename', authMiddleware, validateParams(filenameParamsSchema), deleteFile);

export default router;
