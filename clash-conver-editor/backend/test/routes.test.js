/**
 * P4-10：路由参数/Body 校验测试（集成）
 * 目标：确保 validate.middleware.js + Joi schema 实际生效
 */

import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

const ORIGINAL_ENV = { ...process.env };

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

describe('路由校验（P4-10）', () => {
  let createApp;
  let app;
  let agent;

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

  beforeEach(async () => {
    app = createApp();

    agent = request.agent(app);

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'testpass123' })
      .expect(200);

    assert.ok(loginRes.headers['set-cookie'], '登录成功后应下发 Cookie');
  });

  describe('Auth 路由', () => {
    it('POST /api/auth/login：空 body → 400', async () => {
      const res = await request(app).post('/api/auth/login').send({}).expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error);
    });

    it('POST /api/auth/login：缺少 username → 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'test' })
        .expect(400);

      assert.equal(res.body.success, false);
    });

    it('POST /api/auth/login：缺少 password → 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test' })
        .expect(400);

      assert.equal(res.body.success, false);
    });

    it('POST /api/auth/login：超长 username → 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'a'.repeat(100), password: 'test' })
        .expect(400);

      assert.equal(res.body.success, false);
    });

    it('POST /api/auth/login：超长 password → 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test', password: 'a'.repeat(200) })
        .expect(400);

      assert.equal(res.body.success, false);
    });
  });

  describe('Files 路由', () => {
    it('GET /api/files/read/:filename：非法字符 → 400', async () => {
      const res = await agent.get('/api/files/read/test@file.yaml').expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error);
    });

    it('GET /api/files/read/:filename：路径遍历 → 400', async () => {
      const res = await agent.get('/api/files/read/..%2Fsecret.yaml').expect(400);

      assert.equal(res.body.success, false);
    });

    it('DELETE /api/files/:filename：非法字符 → 400', async () => {
      const res = await agent.delete('/api/files/test@file.yaml').expect(400);

      assert.equal(res.body.success, false);
    });

    it('POST /api/files/save：缺少 filename → 400', async () => {
      const res = await agent.post('/api/files/save').send({ config: { key: 'value' } }).expect(400);

      assert.equal(res.body.success, false);
    });

    it('POST /api/files/save：缺少 config → 400', async () => {
      const res = await agent.post('/api/files/save').send({ filename: 'test.yaml' }).expect(400);

      assert.equal(res.body.success, false);
    });

    it('POST /api/files/save：非法 filename → 400', async () => {
      const res = await agent
        .post('/api/files/save')
        .send({ filename: 'test@file.yaml', config: { key: 'value' } })
        .expect(400);

      assert.equal(res.body.success, false);
    });
  });

  describe('Config 路由', () => {
    it('POST /api/config/parse：缺少 content → 400', async () => {
      const res = await agent.post('/api/config/parse').send({}).expect(400);

      assert.equal(res.body.success, false);
    });

    it('POST /api/config/parse：空 content → 400', async () => {
      const res = await agent.post('/api/config/parse').send({ content: '' }).expect(400);

      assert.equal(res.body.success, false);
    });

    it('POST /api/config/parse：合法 YAML → 200', async () => {
      const res = await agent.post('/api/config/parse').send({ content: 'key: value\n' }).expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.config.key, 'value');
    });

    it('POST /api/config/validate：缺少 config → 400', async () => {
      const res = await agent.post('/api/config/validate').send({}).expect(400);

      assert.equal(res.body.success, false);
    });

    it('POST /api/config/validate：合法对象 → 200', async () => {
      const res = await agent.post('/api/config/validate').send({ config: { port: 7890 } }).expect(200);

      assert.equal(res.body.success, true);
      assert.equal(typeof res.body.valid, 'boolean');
    });
  });
});
