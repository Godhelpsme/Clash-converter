/**
 * P4-10：文件相关测试（集成）
 * 覆盖：路径遍历、文件名校验、save/list/read/delete、备份生成、symlink 防护
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

const ORIGINAL_ENV = { ...process.env };

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testConfigDir = path.join(__dirname, '..', '..', 'configs');
const testBackupDir = path.join(__dirname, '..', '..', '.backups');
const REQUEST_TIMEOUT = { response: 5000, deadline: 15000 };

describe('文件（P4-10）', () => {
  let app;
  let agent;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENABLED = 'true';
    process.env.AUTH_USERNAME = 'testuser';
    process.env.AUTH_PASSWORD = 'testpass123';
    process.env.UPLOAD_MAX_FILE_SIZE_MB = '1';

    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.mkdir(testBackupDir, { recursive: true });

    const server = await importFresh('../server.js');
    app = server.createApp();

    agent = request.agent(app);

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'testpass123' })
      .expect(200);

    assert.ok(loginRes.headers['set-cookie'], '登录成功后应下发 Cookie');
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

  afterEach(async () => {
    const files = await fs.readdir(testConfigDir).catch(() => []);
    for (const file of files) {
      if (file.startsWith('test-') || file.startsWith('file-')) {
        await fs.rm(path.join(testConfigDir, file), { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  describe('文件名/路径校验', () => {
    it('拒绝 URL 编码的路径遍历', async () => {
      const res = await agent.get('/api/files/read/..%2F..%2Fetc%2Fpasswd').expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error);
    });

    it('拒绝包含反斜杠的文件名', async () => {
      const res = await agent.get('/api/files/read/test\\file.yaml').expect(400);

      assert.equal(res.body.success, false);
    });

    it('拒绝包含正斜杠的文件名', async () => {
      const res = await agent.get('/api/files/read/test/file.yaml').expect(400);

      assert.equal(res.body.success, false);
    });

    it('合法文件名可正常读取', async () => {
      await fs.writeFile(path.join(testConfigDir, 'test-valid.yaml'), 'key: value\n');

      const res = await agent.get('/api/files/read/test-valid.yaml').expect(200);

      assert.equal(res.body.success, true);
    });
  });

  describe('文件 CRUD + 备份', () => {
    it('list 返回文件列表', async () => {
      await fs.writeFile(path.join(testConfigDir, 'test-list.yaml'), 'key: value\n');
      await fs.mkdir(path.join(testConfigDir, 'test-dir.yaml'), { recursive: true });

      const res = await agent.get('/api/files/list').timeout(REQUEST_TIMEOUT).expect(200);

      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.files));
      assert.ok(res.body.files.some((file) => file.name === 'test-list.yaml'));
      assert.ok(res.body.files.every((file) => file.name !== 'test-dir.yaml'));
    });

    it('save 写入 YAML 文件', async () => {
      const res = await agent
        .post('/api/files/save')
        .send({
          filename: 'test-save.yaml',
          config: { key: 'value' }
        })
        .expect(200);

      assert.equal(res.body.success, true);

      const content = await fs.readFile(path.join(testConfigDir, 'test-save.yaml'), 'utf8');
      assert.ok(content.includes('key'));
    });

    it('保存已存在文件时会生成备份', async () => {
      const filename = 'test-backup.yaml';
      await fs.writeFile(path.join(testConfigDir, filename), 'original: content\n');

      await agent
        .post('/api/files/save')
        .send({
          filename,
          config: { updated: 'content' }
        })
        .expect(200);

      const backups = await fs.readdir(testBackupDir);
      const hasBackup = backups.some((f) => f.startsWith(filename));
      assert.ok(hasBackup, '应生成备份文件');
    });

    it('delete 删除文件', async () => {
      const filename = 'test-delete.yaml';
      await fs.writeFile(path.join(testConfigDir, filename), 'key: value\n');

      const res = await agent.delete(`/api/files/${filename}`).expect(200);

      assert.equal(res.body.success, true);

      const exists = await fs
        .access(path.join(testConfigDir, filename))
        .then(() => true)
        .catch(() => false);
      assert.equal(exists, false);
    });

    it('读取不存在文件返回 404', async () => {
      const res = await agent
        .get('/api/files/read/non-existent-file.yaml')
        .timeout(REQUEST_TIMEOUT)
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'File not found');
    });
  });

  describe('save 参数校验', () => {
    it('缺少 filename 返回 400', async () => {
      const res = await agent.post('/api/files/save').send({ config: { key: 'value' } }).expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error);
    });

    it('缺少 config 返回 400', async () => {
      const res = await agent.post('/api/files/save').send({ filename: 'test.yaml' }).expect(400);

      assert.equal(res.body.success, false);
    });

    it('非 yaml/yml 扩展名返回 400', async () => {
      const res = await agent
        .post('/api/files/save')
        .send({ filename: 'test.txt', config: { key: 'value' } })
        .expect(400);

      assert.equal(res.body.success, false);
    });

    it('目标已存在但不是普通文件返回 400', async () => {
      const dirname = 'test-save-dir.yaml';
      await fs.mkdir(path.join(testConfigDir, dirname), { recursive: true });

      const res = await agent
        .post('/api/files/save')
        .timeout(REQUEST_TIMEOUT)
        .send({ filename: dirname, config: { key: 'value' } })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'Invalid file type');
    });
  });

  describe('symlink 防护', () => {
    const symlinkName = 'test-symlink.yaml';
    const symlinkPath = path.join(testConfigDir, symlinkName);
    const targetName = 'test-symlink-target.yaml';
    const targetPath = path.join(testConfigDir, targetName);

    afterEach(async () => {
      await fs.unlink(symlinkPath).catch(() => {});
      await fs.unlink(targetPath).catch(() => {});
    });

    it('read：拒绝 symlink（即使指向 configs 内部）', async (t) => {
      try {
        await fs.writeFile(targetPath, 'key: value\n');
        await fs.symlink(targetPath, symlinkPath);
      } catch (err) {
        if (err?.code === 'EPERM') {
          t.skip('当前环境缺少创建 symlink 权限（Windows 需要管理员或开发者模式）');
          return;
        }
        throw err;
      }

      const res = await agent
        .get(`/api/files/read/${symlinkName}`)
        .timeout(REQUEST_TIMEOUT)
        .expect(403);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'Access denied');
    });

    it('list：不应返回 symlink', async (t) => {
      try {
        await fs.writeFile(targetPath, 'key: value\n');
        await fs.symlink(targetPath, symlinkPath);
      } catch (err) {
        if (err?.code === 'EPERM') {
          t.skip('当前环境缺少创建 symlink 权限（Windows 需要管理员或开发者模式）');
          return;
        }
        throw err;
      }

      const res = await agent.get('/api/files/list').timeout(REQUEST_TIMEOUT).expect(200);

      assert.equal(res.body.success, true);
      assert.ok(res.body.files.every((file) => file.name !== symlinkName));
    });

    it('save：拒绝覆盖 symlink', async (t) => {
      try {
        await fs.writeFile(targetPath, 'key: value\n');
        await fs.symlink(targetPath, symlinkPath);
      } catch (err) {
        if (err?.code === 'EPERM') {
          t.skip('当前环境缺少创建 symlink 权限（Windows 需要管理员或开发者模式）');
          return;
        }
        throw err;
      }

      const res = await agent
        .post('/api/files/save')
        .timeout(REQUEST_TIMEOUT)
        .send({ filename: symlinkName, config: { malicious: 'content' } })
        .expect(403);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'Access denied');
    });

    it('delete：拒绝删除 symlink 且不影响目标文件', async (t) => {
      try {
        await fs.writeFile(targetPath, 'key: value\n');
        await fs.symlink(targetPath, symlinkPath);
      } catch (err) {
        if (err?.code === 'EPERM') {
          t.skip('当前环境缺少创建 symlink 权限（Windows 需要管理员或开发者模式）');
          return;
        }
        throw err;
      }

      const res = await agent
        .delete(`/api/files/${symlinkName}`)
        .timeout(REQUEST_TIMEOUT)
        .expect(403);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'Access denied');

      const targetExists = await fs
        .access(targetPath)
        .then(() => true)
        .catch(() => false);
      assert.equal(targetExists, true, '目标文件不应被误删');
    });
  });
});
