/**
 * P4-10：后端入口/HTTP 行为测试（集成）
 * 覆盖：/api 404 JSON、SPA fallback、CORS、X-Powered-By、TRUST_PROXY、上传大小/类型限制
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

describe('Server（P4-10）', () => {
  let createApp;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENABLED = 'true';
    process.env.AUTH_USERNAME = 'testuser';
    process.env.AUTH_PASSWORD = 'testpass123';
    process.env.UPLOAD_MAX_FILE_SIZE_MB = '1';

    const server = await importFresh('../server.js');
    createApp = server.createApp;
  });

  after(async () => {
    // 还原环境变量，避免跨文件相互污染
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      process.env[key] = value;
    }
  });

  describe('/api 404 与 SPA fallback', () => {
    it('GET /api/不存在路由 → 404 + JSON', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/this-route-does-not-exist')
        .expect(404)
        .expect('Content-Type', /json/);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'Not Found');
    });

    it('POST /api/不存在路由 → 404 + JSON', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/non-existent')
        .send({ data: 'test' })
        .expect(404)
        .expect('Content-Type', /json/);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error);
    });

    it('非 /api 路由应走 SPA fallback（HTML）', async () => {
      const app = createApp();
      const res = await request(app).get('/some-frontend-route').expect(200);

      assert.ok(
        String(res.headers['content-type'] || '').includes('text/html') ||
          res.text.includes('<!DOCTYPE html>') ||
          res.text.includes('<html'),
        '应返回 HTML（index.html）'
      );
    });
  });

  describe('CORS', () => {
    it('生产环境未配置 ALLOWED_ORIGINS 时不应回 ACAO', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_ORIGINS = '';

      const app = createApp();
      const res = await request(app).get('/api/auth/status').set('Origin', 'http://evil.com');

      assert.ok(!res.headers['access-control-allow-origin']);
    });

    it('生产环境应允许白名单 Origin', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_ORIGINS = 'http://allowed.com,http://also-allowed.com';

      const app = createApp();
      const res = await request(app).get('/api/auth/status').set('Origin', 'http://allowed.com');

      assert.equal(res.headers['access-control-allow-origin'], 'http://allowed.com');
    });

    it('开发环境默认允许 localhost:5173', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ALLOWED_ORIGINS;

      const app = createApp();
      const res = await request(app).get('/api/auth/status').set('Origin', 'http://localhost:5173');

      assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    });

    it('不应开启 credentials', async () => {
      process.env.NODE_ENV = 'development';
      const app = createApp();

      const res = await request(app)
        .options('/api/auth/status')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      assert.ok(res.headers['access-control-allow-credentials'] !== 'true');
    });
  });

  describe('安全性 HTTP 头', () => {
    it('不暴露 X-Powered-By', async () => {
      const app = createApp();
      const res = await request(app).get('/api/auth/status').expect(200);
      assert.ok(!res.headers['x-powered-by']);
    });
  });

  describe('TRUST_PROXY', () => {
    it('TRUST_PROXY=true 时应信任 X-Forwarded-For', async () => {
      process.env.TRUST_PROXY = 'true';

      const app = createApp();
      const res = await request(app).get('/api/auth/status').set('X-Forwarded-For', '1.2.3.4').expect(200);

      assert.equal(res.body.success, true);
    });
  });

  describe('上传大小/类型限制', () => {
    it('超出 UPLOAD_MAX_FILE_SIZE_MB=1 应返回 413', async () => {
      const app = createApp();
      const largeContent = 'a'.repeat(2 * 1024 * 1024);

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass123' })
        .expect(200);

      const res = await agent
        .post('/api/files/upload')
        .attach('file', Buffer.from(largeContent), 'large.yaml')
        .expect(413);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error);
    });

    it('允许 1MB 内的 YAML 文件', async () => {
      const app = createApp();
      const smallContent = 'key: value\n';

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass123' })
        .expect(200);

      const res = await agent
        .post('/api/files/upload')
        .attach('file', Buffer.from(smallContent), 'small.yaml')
        .expect(200);

      assert.equal(res.body.success, true);
    });

    it('拒绝非 YAML 文件类型（400）', async () => {
      const app = createApp();
      const content = 'some text content';

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass123' })
        .expect(200);

      const res = await agent
        .post('/api/files/upload')
        .attach('file', Buffer.from(content), 'test.txt')
        .expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error);
    });
  });

  describe('/api/config/parse', () => {
    it('非法 YAML 返回 400 + JSON', async () => {
      const app = createApp();
      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass123' })
        .expect(200);

      const res = await agent
        .post('/api/config/parse')
        .send({ content: 'invalid: yaml: content: [' })
        .expect(400)
        .expect('Content-Type', /json/);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error);
    });
  });
});
