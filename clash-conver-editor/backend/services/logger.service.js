import pino from 'pino';

const level = (process.env.LOG_LEVEL || 'info').toLowerCase();

// 结构化日志：默认输出 JSON 单行，便于采集（stdout -> 容器日志/ELK/Datadog 等）
// 注意：严禁在日志里输出敏感信息（token、password、cookie 等）。
export const logger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      // 常见鉴权/会话敏感头
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      'req.headers["proxy-authorization"]',
      'req.headers["x-api-key"]',
      'req.headers["x-auth-token"]',
      'req.headers["x-access-token"]',

      // 常见敏感 body 字段（即使当前不记录 body，也先做防呆）
      'req.body.password',
      'req.body.token',
      'req.body.accessToken',
      'req.body.refreshToken',

      // 避免把服务端 Set-Cookie 写入日志
      'res.headers["set-cookie"]'
    ],
    censor: '[REDACTED]'
  }
});

