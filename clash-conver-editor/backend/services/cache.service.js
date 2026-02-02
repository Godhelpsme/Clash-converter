import fs from 'fs/promises';
import { LRUCache } from 'lru-cache';
import { parseYAML } from './yaml.service.js';

const cache = new LRUCache({
  max: 50,
  ttl: 1000 * 60 * 10,
  updateAgeOnGet: true
});

const inflight = new Map();

export const getConfigFromCache = async (filePath, content, stats) => {
  const fileStats = stats || (await fs.stat(filePath));
  const cacheKey = `${filePath}:${fileStats.mtimeMs}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const yamlContent = content || (await fs.readFile(filePath, 'utf8'));
  const promise = parseYAML(yamlContent)
    .then((config) => {
      cache.set(cacheKey, config);
      return config;
    })
    .finally(() => {
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, promise);
  return promise;
};

export const clearConfigCache = () => cache.clear();

