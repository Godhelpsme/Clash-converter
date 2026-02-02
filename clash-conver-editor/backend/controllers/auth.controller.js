import { isAuthEnabled, extractToken, loginUser, logoutToken, TOKEN_EXPIRY_TIME } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';

export const status = (req, res) => {
  res.json({
    success: true,
    authEnabled: isAuthEnabled()
  });
};

export const login = (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const username = req.body?.username;
  const result = loginUser({
    username,
    password: req.body?.password,
    clientIp
  });

  if (result.status !== 200) {
    const requestLogger = req.log || logger;
    requestLogger.warn(
      {
        action: 'auth.login_failed',
        username,
        clientIp,
        status: result.status,
        remainingAttempts: result.payload?.remainingAttempts
      },
      '登录失败'
    );
  }

  if (result.status === 200 && result.payload?.success && result.payload?.token) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('auth_token', result.payload.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: TOKEN_EXPIRY_TIME,
      path: '/'
    });
  }

  res.status(result.status).json(result.payload);
};

export const verify = (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid'
  });
};

export const logout = (req, res) => {
  const tokenFromCookie = req.cookies?.auth_token;
  const tokenFromHeader = extractToken(req.headers.authorization);
  const token = tokenFromCookie || tokenFromHeader;

  logoutToken(token);
  res.clearCookie('auth_token', { path: '/' });

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};
