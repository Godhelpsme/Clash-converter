import { parentPort } from 'worker_threads';
import yaml from 'js-yaml';

const DEFAULT_MAX_ALIAS_COUNT = 100;

const maxAliasCountRaw = Number(process.env.YAML_MAX_ALIAS_COUNT);
const maxAliasCount = Number.isFinite(maxAliasCountRaw) ? Math.max(0, maxAliasCountRaw) : DEFAULT_MAX_ALIAS_COUNT;

const loadOptions = {
  schema: yaml.JSON_SCHEMA,
  json: true,
  maxAliasCount
};

const countYamlAliasNodes = (content) => {
  // 简单统计 `*alias` 形式的别名节点，用于兜底限制 YAML Bomb（js-yaml 4.1.0 无内建 maxAliasCount 选项）。
  const matches = content.match(/(^|[\s\[{,:])\*[0-9A-Za-z_-]+/gm);
  return matches ? matches.length : 0;
};

const handleMessage = (message) => {
  const { id, action, payload, options } = message;

  try {
    if (action === 'load') {
      const aliasCount = countYamlAliasNodes(payload.content);
      if (aliasCount > maxAliasCount) {
        throw new Error(`YAML aliases exceed limit (${aliasCount} > ${maxAliasCount})`);
      }

      const result = yaml.load(payload.content, loadOptions);
      parentPort.postMessage({ id, success: true, result });
      return;
    }

    if (action === 'dump') {
      const result = yaml.dump(payload.config, options);
      parentPort.postMessage({ id, success: true, result });
      return;
    }

    parentPort.postMessage({ id, success: false, error: 'Unknown action' });
  } catch (error) {
    parentPort.postMessage({ id, success: false, error: error.message });
  }
};

parentPort.on('message', handleMessage);
