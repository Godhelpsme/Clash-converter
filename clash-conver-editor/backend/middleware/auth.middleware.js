import { isAuthEnabled, extractToken, verifyToken } from '../services/auth.service.js';

export const authMiddleware = (req, res, next) => {
  if (!isAuthEnabled()) {
    return next();
  }

  const tokenFromCookie = req.cookies?.auth_token;
  const tokenFromHeader = extractToken(req.headers.authorization);
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!verifyToken(token)) {
    return res.status(401).json({ success: false, error: 'Token expired or invalid' });
  }

  next();
};
