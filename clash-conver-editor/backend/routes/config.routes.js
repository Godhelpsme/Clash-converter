import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { parseConfig, validateConfigHandler } from '../controllers/config.controller.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { parseContentSchema, configBodySchema } from '../validators/file.validator.js';

const router = Router();

router.post('/parse', authMiddleware, validateBody(parseContentSchema), parseConfig);
router.post('/validate', authMiddleware, validateBody(configBodySchema), validateConfigHandler);

export default router;
