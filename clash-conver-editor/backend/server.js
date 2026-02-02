import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import authRoutes from './routes/auth.routes.js';
import filesRoutes from './routes/files.routes.js';
import configRoutes from './routes/config.routes.js';
import { configDir, publicDir } from './services/path.service.js';
import { logger } from './services/logger.service.js';
import { errorHandler } from './middleware/error.middleware.js';

const require = createRequire(import.meta.url);

let cookieParser = null;
try {
  cookieParser = require('cookie-parser');
} catch {
  // 受限环境下可能无法安装依赖：此时使用轻量兜底解析，避免阻塞开发/测试
  cookieParser = null;
}

let cookieLib = null;
try {
  cookieLib = require('cookie');
} catch {
  cookieLib = null;
}

const fallbackCookieParser = () => (req, res, next) => {
  if (req.cookies) return next();

  const header = req.headers?.cookie;
  const headerValue = Array.isArray(header) ? header[0] : header;

  if (typeof headerValue !== 'string' || headerValue.trim() === '' || !cookieLib) {
    req.cookies = {};
    return next();
  }

  req.cookies = cookieLib.parse(headerValue);
  return next();
};

const devDefaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const parseAllowedOrigins = (rawAllowedOrigins) =>
  String(rawAllowedOrigins || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const createApp = () => {
  const app = express();

  // Sentry 初始化（必须在所有中间件之前）
  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn && sentryDsn.trim() !== '') {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE,
      integrations: [
        Sentry.httpIntegration(),
        Sentry.expressIntegration({ app })
      ],
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0
    });

    // Sentry 请求处理中间件（必须在其他中间件之前）
    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());
  }

  // 反向代理场景信任 X-Forwarded-* 头
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // 禁用 X-Powered-By 头，避免信息泄露
  app.disable('x-powered-by');

  // HTTP 请求结构化日志（JSON 单行）+ requestId（支持透传 X-Request-Id）
  app.use(
    pinoHttp({
      logger,
      quietReqLogger: true,
      customAttributeKeys: {
        reqId: 'requestId'
      },
      customSuccessObject: (req, res, loggableObject) => ({
        ...loggableObject,
        statusCode: res.statusCode
      }),
      customErrorObject: (req, res, err, loggableObject) => ({
        ...loggableObject,
        statusCode: res.statusCode
      }),
      genReqId: (req) => {
        const header = req.headers['x-request-id'];
        const headerValue = Array.isArray(header) ? header[0] : header;
        if (typeof headerValue === 'string' && headerValue.trim() !== '') return headerValue.trim();
        return typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : crypto.randomBytes(16).toString('hex');
      }
    })
  );

  // 回传 requestId 便于客户端/反代定位问题
  app.use((req, res, next) => {
    if (req.id) {
      res.setHeader('X-Request-Id', req.id);
    }
    next();
  });

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
    : isProd
      ? []
      : devDefaultOrigins;

  const corsOptions = {
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: false,
    optionsSuccessStatus: 200
  };

  app.use(cors(corsOptions));

  // Cookie 解析：为 Cookie 鉴权提供 req.cookies（P4-13）
  app.use(cookieParser ? cookieParser() : fallbackCookieParser());

  app.use(express.json({ limit: '5mb' }));
  app.use(express.static(publicDir));

  app.use('/api/auth', authRoutes);
  app.use('/api/files', filesRoutes);
  app.use('/api/config', configRoutes);

  // API 404 处理，避免被 SPA fallback 吞掉
  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'Not Found' });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Sentry 错误处理中间件（必须在其他错误处理之前，但在路由之后）
  if (sentryDsn && sentryDsn.trim() !== '') {
    app.use(Sentry.Handlers.errorHandler());
  }

  // 统一错误处理（后续包会增强其行为）
  app.use(errorHandler);

  return app;
};

export const startServer = ({ port = process.env.PORT || 3000 } = {}) => {
  const app = createApp();

  const server = app.listen(port, () => {
    logger.info(
      {
        port,
        configDir
      },
      `Clash Config Editor running on http://localhost:${port}`
    );
  });

  return { app, server };
};

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startServer();
}
