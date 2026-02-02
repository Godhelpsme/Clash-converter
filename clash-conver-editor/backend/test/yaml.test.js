/**
 * P4-10：YAML Worker 测试（单元）
 * 覆盖：alias 限制（YAML Bomb 兜底）、背压（pending 上限）、超时与自恢复
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

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

after(() => {
  // 还原环境变量，避免跨文件相互污染
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe('YAML Worker（P4-10）', () => {
  describe('alias 限制（YAML Bomb 兜底）', () => {
    it('YAML_MAX_ALIAS_COUNT=0 时拒绝包含 alias 的 YAML', async () => {
      const content = `
anchor: &anchor value
ref1: *anchor
`;

      await withEnv(
        {
          YAML_MAX_ALIAS_COUNT: '0',
          YAML_WORKER_POOL_SIZE: '1'
        },
        async () => {
          const yaml = await importFresh('../services/yaml.service.js');
          try {
            await assert.rejects(yaml.parseYAML(content), /aliases exceed limit/i);
          } finally {
            await yaml.shutdownYamlWorkers();
          }
        }
      );
    });

    it('YAML_MAX_ALIAS_COUNT 足够大时允许 alias', async () => {
      const content = `
anchor: &anchor value
ref1: *anchor
`;

      await withEnv(
        {
          YAML_MAX_ALIAS_COUNT: '10',
          YAML_WORKER_POOL_SIZE: '1'
        },
        async () => {
          const yaml = await importFresh('../services/yaml.service.js');
          try {
            const parsed = await yaml.parseYAML(content);
            assert.equal(parsed.anchor, 'value');
            assert.equal(parsed.ref1, 'value');
          } finally {
            await yaml.shutdownYamlWorkers();
          }
        }
      );
    });
  });

  describe('背压（pending 上限）', () => {
    it('YAML_MAX_PENDING=1 时会拒绝部分并发任务', async () => {
      await withEnv(
        {
          YAML_MAX_PENDING: '1',
          YAML_WORKER_POOL_SIZE: '1'
        },
        async () => {
          const yaml = await importFresh('../services/yaml.service.js');
          try {
            const content = 'key: value\n';
            const tasks = Array.from({ length: 50 }, () =>
              yaml.parseYAML(content).then(
                () => ({ ok: true }),
                (err) => ({ ok: false, err })
              )
            );

            const results = await Promise.all(tasks);
            const rejected = results.filter(
              (r) => !r.ok && String(r.err?.message || '').includes('Too many pending')
            ).length;

            assert.ok(rejected > 0, `预期出现拒绝，实际 rejected=${rejected}`);
          } finally {
            await yaml.shutdownYamlWorkers();
          }
        }
      );
    });
  });

  describe('超时 + 自恢复', () => {
    it('任务超时后 worker 会被替换，后续请求可继续处理', async () => {
      await withEnv(
        {
          YAML_TASK_TIMEOUT_MS: '50',
          YAML_WORKER_POOL_SIZE: '1'
        },
        async () => {
          const yaml = await importFresh('../services/yaml.service.js');
          try {
            // 覆盖场景：超大 YAML 导致解析耗时过长，触发超时并终止 worker
            // 这里用 repeat 生成 ~8MB 文本，避免创建超大的数组占用内存。
            const largeYaml = 'items:\n' + '  - item: value\n'.repeat(500000);

            await assert.rejects(yaml.parseYAML(largeYaml), /timed out/i);

            // 等待 worker.terminate() -> exit -> createWorker() 完成
            await new Promise((r) => setTimeout(r, 120));

            const parsed = await yaml.parseYAML('key: value\n');
            assert.equal(parsed.key, 'value');
          } finally {
            await yaml.shutdownYamlWorkers();
          }
        }
      );
    });
  });
});

