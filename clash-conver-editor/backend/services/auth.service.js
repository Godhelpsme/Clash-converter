import crypto from 'crypto';

const NODE_ENV = process.env.NODE_ENV || 'development';

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin';

const AUTH_USERNAME = process.env.AUTH_USERNAME || DEFAULT_USERNAME;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || DEFAULT_PASSWORD;

const getTrimmedEnv = (name) => {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
};

// JWT 密钥：生产环境必须显式配置；非生产环境提供默认值，便于本地开发与测试
const JWT_SECRET = getTrimmedEnv('AUTH_JWT_SECRET') || 'dev-insecure-jwt-secret';

// 生产环境强制要求显式设置认证凭据，避免默认弱口令上线
if (AUTH_ENABLED && NODE_ENV === 'production') {
  const hasExplicitUsername =
    typeof process.env.AUTH_USERNAME === 'string' && process.env.AUTH_USERNAME.trim() !== '';
  const hasExplicitPassword =
    typeof process.env.AUTH_PASSWORD === 'string' && process.env.AUTH_PASSWORD.trim() !== '';

  if (!hasExplicitUsername || !hasExplicitPassword) {
    throw new Error(
      'AUTH_USERNAME and AUTH_PASSWORD must be explicitly set when AUTH_ENABLED=true in production'
    );
  }

  if (AUTH_USERNAME === DEFAULT_USERNAME && AUTH_PASSWORD === DEFAULT_PASSWORD) {
    throw new Error('Refusing to start with default AUTH_USERNAME/AUTH_PASSWORD in production');
  }

  const hasExplicitJwtSecret = typeof process.env.AUTH_JWT_SECRET === 'string' && process.env.AUTH_JWT_SECRET.trim() !== '';
  if (!hasExplicitJwtSecret) {
    throw new Error('AUTH_JWT_SECRET must be explicitly set when AUTH_ENABLED=true in production');
  }
}

const parsePositiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const DEFAULT_TOKEN_TTL_MS = 86_400_000; // 24小时
const MIN_TOKEN_TTL_MS = 60_000; // 1分钟（生产环境防误配）
const configuredTokenTtlMs =
  parsePositiveNumber(process.env.AUTH_JWT_TTL_MS) ||
  parsePositiveNumber(process.env.AUTH_TOKEN_TTL_MS) ||
  DEFAULT_TOKEN_TTL_MS;
export const TOKEN_EXPIRY_TIME =
  NODE_ENV === 'production' ? Math.max(MIN_TOKEN_TTL_MS, configuredTokenTtlMs) : configuredTokenTtlMs;

// 时序安全的字符串比较，防止时序攻击推断凭据
const safeStringEqual = (a, b) => {
  const aBuf = Buffer.from(String(a), 'utf8');
  const bBuf = Buffer.from(String(b), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_TIME = 15 * 60 * 1000; // 15分钟

// 清理过期/异常的登录尝试记录，避免 loginAttempts 在海量 IP 场景下无限增长导致内存泄漏
const pruneLoginAttempts = () => {
  const nowMs = Date.now();

  for (const [ip, attemptData] of loginAttempts.entries()) {
    const lastAttempt = attemptData?.lastAttempt;

    // lastAttempt 可能在 Map 形态损坏等场景下出现，直接删除避免后续计算异常
    if (typeof lastAttempt !== 'number' || !Number.isFinite(lastAttempt)) {
      loginAttempts.delete(ip);
      continue;
    }

    if (nowMs - lastAttempt >= LOGIN_BLOCK_TIME) {
      loginAttempts.delete(ip);
    }
  }
};

const JWT_ALG = 'HS256';

const base64UrlEncodeJson = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
const base64UrlDecodeJson = (input) => {
  const buf = Buffer.from(String(input), 'base64url');
  return JSON.parse(buf.toString('utf8'));
};

const generateJti = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

const signJwt = ({ username, ttlMs }) => {
  const nowMs = Date.now();
  const iat = Math.floor(nowMs / 1000);
  const expMs = nowMs + ttlMs;
  // exp 为秒级字段：向上取整，避免 <1s 的 ttl 直接被秒级 exp 提前过期
  const exp = Math.ceil(expMs / 1000);
  const jti = generateJti();

  const header = { alg: JWT_ALG, typ: 'JWT' };
  const payload = {
    sub: username,
    username,
    iat,
    exp,
    expMs,
    jti
  };

  const headerPart = base64UrlEncodeJson(header);
  const payloadPart = base64UrlEncodeJson(payload);
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(signingInput).digest('base64url');

  return `${signingInput}.${signature}`;
};

export const isAuthEnabled = () => AUTH_ENABLED;

export const extractToken = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
};

export const verifyToken = (token) => {
  if (typeof token !== 'string' || token.trim() === '') return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) return false;

  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(signingInput)
    .digest('base64url');

  if (!safeStringEqual(signaturePart, expectedSignature)) return false;

  let header;
  let payload;
  try {
    header = base64UrlDecodeJson(headerPart);
    payload = base64UrlDecodeJson(payloadPart);
  } catch {
    return false;
  }

  if (!header || typeof header !== 'object') return false;
  if (header.alg !== JWT_ALG || header.typ !== 'JWT') return false;

  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.sub !== 'string' || payload.sub.trim() === '') return false;

  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  if (typeof payload.expMs === 'number' && Number.isFinite(payload.expMs) && nowMs >= payload.expMs) {
    return false;
  }

  if (typeof payload.exp === 'number' && Number.isFinite(payload.exp) && nowSec >= payload.exp) {
    return false;
  }

  return true;
};

const getLoginBlockInfo = (clientIp) => {
  pruneLoginAttempts();

  const attemptData = loginAttempts.get(clientIp);
  if (!attemptData || attemptData.count < MAX_LOGIN_ATTEMPTS) {
    return { blocked: false };
  }

  const timeSinceLastAttempt = Date.now() - attemptData.lastAttempt;
  if (timeSinceLastAttempt >= LOGIN_BLOCK_TIME) {
    loginAttempts.delete(clientIp);
    return { blocked: false };
  }

  const remainingMinutes = Math.ceil((LOGIN_BLOCK_TIME - timeSinceLastAttempt) / 60000);
  return { blocked: true, remainingMinutes };
};

export const loginUser = ({ username, password, clientIp }) => {
  if (!AUTH_ENABLED) {
    return {
      status: 400,
      payload: {
        success: false,
        error: 'Authentication is not enabled',
        message: 'Authentication is not enabled'
      }
    };
  }

  const blockInfo = getLoginBlockInfo(clientIp);
  if (blockInfo.blocked) {
    return {
      status: 429,
      payload: {
        success: false,
        error: `Too many login attempts. Please try again in ${blockInfo.remainingMinutes} minutes.`,
        message: `Too many login attempts. Please try again in ${blockInfo.remainingMinutes} minutes.`
      }
    };
  }

  if (safeStringEqual(username, AUTH_USERNAME) && safeStringEqual(password, AUTH_PASSWORD)) {
    loginAttempts.delete(clientIp);
    const token = signJwt({ username, ttlMs: TOKEN_EXPIRY_TIME });

    return {
      status: 200,
      payload: {
        success: true,
        token,
        expiresIn: TOKEN_EXPIRY_TIME,
        message: 'Login successful'
      }
    };
  }

  const attemptData = loginAttempts.get(clientIp);
  const attempts = attemptData ? attemptData.count + 1 : 1;
  loginAttempts.set(clientIp, { count: attempts, lastAttempt: Date.now() });

  return {
    status: 401,
    payload: {
      success: false,
      error: 'Invalid username or password',
      message: 'Invalid username or password',
      remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - attempts)
    }
  };
};

export const logoutToken = (token) => {
  // 方案A（无状态）：JWT 不再存储在服务端，logout 仅清理 Cookie/客户端丢弃即可
  // 方案B（推荐“完美”）：后续可在此引入 Redis 等共享存储维护 jti 黑名单/会话版本，实现可吊销
  void token;
};
