/**
 * P4-10：认证测试（单元 + 集成）
 * - 单元：生产启动校验、Token TTL、登录限流
 * - 集成：/api/auth/status|login|verify|logout
 *
 * 说明：本仓库在受限环境下可能禁止 child_process.spawn，因此测试使用 ESM 动态 import
 * 来实现“按环境变量重新加载模块”的需求。
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

const ORIGINAL_ENV = { ...process.env };

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

const withEnv = async (overrides, fn) => {
  const previous = {};

  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
    if (value === null) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await fn();
  } finally {
    for (const [key, oldValue] of Object.entries(previous)) {
      if (oldValue === undefined) delete process.env[key];
      else process.env[key] = oldValue;
    }
  }
};

describe('认证（P4-10）', () => {
  after(() => {
    // 还原环境变量，避免跨文件相互污染
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      process.env[key] = value;
    }
  });

  describe('auth.service.js：生产环境启动校验', () => {
    it('NODE_ENV=production + AUTH_ENABLED=true + 未显式设置凭据 → 启动失败（回归锁定）', async () => {
      await withEnv(
        {
          NODE_ENV: 'production',
          AUTH_ENABLED: 'true',
          AUTH_USERNAME: null,
          AUTH_PASSWORD: null
        },
        async () => {
          await assert.rejects(
            importFresh('../services/auth.service.js'),
            /AUTH_USERNAME and AUTH_PASSWORD must be explicitly set/i
          );
        }
      );
    });

    it('NODE_ENV=production + AUTH_ENABLED=true + admin/admin → 启动失败（回归锁定）', async () => {
      await withEnv(
        {
          NODE_ENV: 'production',
          AUTH_ENABLED: 'true',
          AUTH_USERNAME: 'admin',
          AUTH_PASSWORD: 'admin'
        },
        async () => {
          await assert.rejects(
            importFresh('../services/auth.service.js'),
            /Refusing to start with default AUTH_USERNAME\/AUTH_PASSWORD/i
          );
        }
      );
    });
  });

  describe('auth.service.js：Token TTL + 登录限流', () => {
    let auth;

    before(async () => {
      auth = await withEnv(
        {
          NODE_ENV: 'test',
          AUTH_ENABLED: 'true',
          AUTH_USERNAME: 'testuser',
          AUTH_PASSWORD: 'testpass123',
          AUTH_JWT_SECRET: 'test-jwt-secret',
          AUTH_TOKEN_TTL_MS: '30'
        },
        async () => importFresh('../services/auth.service.js')
      );
    });

    it('正确凭据登录返回 token/expiresIn', () => {
      const result = auth.loginUser({
        username: 'testuser',
        password: 'testpass123',
        clientIp: '1.1.1.1'
      });

      assert.equal(result.status, 200);
      assert.equal(result.payload.success, true);
      assert.ok(result.payload.token);
      assert.equal(typeof result.payload.expiresIn, 'number');
    });

    it('Token 在 TTL 之后失效', async () => {
      const result = auth.loginUser({
        username: 'testuser',
        password: 'testpass123',
        clientIp: '1.1.1.2'
      });

      const { token } = result.payload;
      assert.equal(auth.verifyToken(token), true);

      await new Promise((r) => setTimeout(r, 80));
      assert.equal(auth.verifyToken(token), false);
    });

    it('JWT 不依赖进程内 Map：重载模块后仍可验证（模拟多实例/重启）', async () => {
      const result = auth.loginUser({
        username: 'testuser',
        password: 'testpass123',
        clientIp: '1.1.1.3'
      });

      const { token } = result.payload;

      const authFresh = await withEnv(
        {
          NODE_ENV: 'test',
          AUTH_ENABLED: 'true',
          AUTH_USERNAME: 'testuser',
          AUTH_PASSWORD: 'testpass123',
          AUTH_JWT_SECRET: 'test-jwt-secret',
          AUTH_TOKEN_TTL_MS: '30'
        },
        async () => importFresh('../services/auth.service.js')
      );
      assert.equal(authFresh.verifyToken(token), true);
    });

    it('同一 IP 多次错误登录后触发 429 限流', () => {
      const clientIp = '9.9.9.9';

      for (let i = 0; i < 5; i += 1) {
        const r = auth.loginUser({
          username: 'testuser',
          password: 'wrong',
          clientIp
        });
        assert.equal(r.status, 401);
        assert.equal(r.payload.success, false);
      }

      const blocked = auth.loginUser({
        username: 'testuser',
        password: 'wrong',
        clientIp
      });

      assert.equal(blocked.status, 429);
      assert.equal(blocked.payload.success, false);
    });

    it('登录失败记录超过窗口后应被自动清理（计数重置）', () => {
      const realNow = Date.now;
      const clientIp = '9.9.9.10';
      const baseMs = 1_700_000_000_000;
      const blockWindowMs = 15 * 60 * 1000;

      try {
        Date.now = () => baseMs;
        const first = auth.loginUser({
          username: 'testuser',
          password: 'wrong',
          clientIp
        });
        assert.equal(first.status, 401);
        assert.equal(first.payload.remainingAttempts, 4);

        // 模拟超过 LOGIN_BLOCK_TIME 后再次失败：应视为“第一次失败”，remainingAttempts 回到 4
        Date.now = () => baseMs + blockWindowMs + 1;
        const second = auth.loginUser({
          username: 'testuser',
          password: 'wrong',
          clientIp
        });
        assert.equal(second.status, 401);
        assert.equal(second.payload.remainingAttempts, 4);
      } finally {
        Date.now = realNow;
      }
    });

    it('lastAttempt 非 number/非有限值时应被直接删除（避免异常阻塞/污染）', () => {
      const realNow = Date.now;
      const clientIp = '9.9.9.11';

      try {
        // 首次失败时写入一个“非有限值”的 lastAttempt（模拟 Map 形态损坏/异常时间源）
        Date.now = () => Number.NaN;
        const first = auth.loginUser({
          username: 'testuser',
          password: 'wrong',
          clientIp
        });
        assert.equal(first.status, 401);

        // 再次失败前恢复时间源：getLoginBlockInfo() 入口应清理该脏数据，计数应重置
        Date.now = () => 1_700_000_000_000;
        const second = auth.loginUser({
          username: 'testuser',
          password: 'wrong',
          clientIp
        });
        assert.equal(second.status, 401);
        assert.equal(second.payload.remainingAttempts, 4);
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe('认证 API：/api/auth/*', () => {
    let app;
    let token;
    let agent;

    before(async () => {
      process.env.NODE_ENV = 'test';
      process.env.AUTH_ENABLED = 'true';
      process.env.AUTH_USERNAME = 'testuser';
      process.env.AUTH_PASSWORD = 'testpass123';
      process.env.AUTH_JWT_SECRET = 'test-jwt-secret';
      // 供后续 server/upload 相关测试复用：upload.service.js 在 import 时读取该值
      process.env.UPLOAD_MAX_FILE_SIZE_MB = '1';

      const server = await importFresh('../server.js');
      app = server.createApp();
      agent = request.agent(app);

      const loginRes = await agent
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass123' })
        .expect(200);

      token = loginRes.body.token;
      assert.ok(token);
      assert.equal(token.split('.').length, 3, 'token 应为三段式 JWT：header.payload.signature');

      const setCookie = loginRes.headers['set-cookie'] || [];
      const authCookie = setCookie.find((c) => String(c).startsWith('auth_token='));
      assert.ok(authCookie, '登录成功后应下发 auth_token Cookie');
      assert.ok(String(authCookie).includes('HttpOnly'), 'auth_token Cookie 应为 HttpOnly');
      assert.ok(String(authCookie).includes('SameSite=Lax'), 'auth_token Cookie SameSite 应为 Lax');
      assert.ok(String(authCookie).includes('Path=/'), 'auth_token Cookie Path 应为 /');
    });

    it('GET /api/auth/status 返回鉴权开关', async () => {
      const res = await request(app).get('/api/auth/status').expect(200);

      assert.equal(res.body.success, true);
      assert.equal(typeof res.body.authEnabled, 'boolean');
    });

    it('POST /api/auth/login：缺少字段返回 400（Joi 校验）', async () => {
      const res = await request(app).post('/api/auth/login').send({}).expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error, '应返回 error 字段');
    });

    it('POST /api/auth/login：错误凭据返回 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'wrong', password: 'wrong' })
        .expect(401);

      assert.equal(res.body.success, false);
    });

    it('GET /api/auth/verify：无 token 返回 401', async () => {
      const res = await request(app).get('/api/auth/verify').expect(401);

      assert.equal(res.body.success, false);
    });

    it('GET /api/auth/verify：有效 token 返回 200', async () => {
      const res = await agent.get('/api/auth/verify').expect(200);

      assert.equal(res.body.success, true);
    });

    it('GET /api/auth/verify：兼容 Bearer header（可选兼容）', async () => {
      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.equal(res.body.success, true);
    });

    it('POST /api/auth/logout：退出后 token 失效', async () => {
      await agent.post('/api/auth/logout').expect(200);

      await agent.get('/api/auth/verify').expect(401);
    });

    it('auth.service.js：同一 IP 多次错误登录后返回 429（覆盖 remainingMinutes 分支）', async () => {
      const auth = await import('../services/auth.service.js');
      const clientIp = '3.3.3.3';

      for (let i = 0; i < 5; i += 1) {
        const r = auth.loginUser({ username: 'testuser', password: 'wrong', clientIp });
        assert.equal(r.status, 401);
      }

      const blocked = auth.loginUser({ username: 'testuser', password: 'wrong', clientIp });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.payload.success, false);
      assert.ok(String(blocked.payload.message || '').includes('Too many login attempts'));
    });
  });
});
