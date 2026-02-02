import { Router } from 'express';
import { status, login, verify, logout } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { loginSchema } from '../validators/auth.validator.js';

const router = Router();

router.get('/status', status);
router.post('/login', validateBody(loginSchema), login);
router.get('/verify', authMiddleware, verify);
router.post('/logout', authMiddleware, logout);

export default router;
