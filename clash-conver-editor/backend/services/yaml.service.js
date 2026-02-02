import os from 'os';
import { Worker } from 'worker_threads';

const workerUrl = new URL('../workers/yaml-worker.js', import.meta.url);
const poolSize = Math.max(
  1,
  Number(process.env.YAML_WORKER_POOL_SIZE) || Math.min(4, Math.max(1, os.cpus().length - 1))
);

const DEFAULT_TASK_TIMEOUT_MS = 15000;
const DEFAULT_MAX_PENDING_TASKS = 200;

const taskTimeoutMsRaw = Number(process.env.YAML_TASK_TIMEOUT_MS);
const taskTimeoutMs = Number.isFinite(taskTimeoutMsRaw)
  ? Math.max(1, taskTimeoutMsRaw)
  : DEFAULT_TASK_TIMEOUT_MS;

const maxPendingTasksRaw = Number(process.env.YAML_MAX_PENDING);
const maxPendingTasks = Number.isFinite(maxPendingTasksRaw)
  ? Math.max(1, maxPendingTasksRaw)
  : DEFAULT_MAX_PENDING_TASKS;

const workers = [];
const pending = new Map();
let cursor = 0;
let sequence = 0;
let isShuttingDown = false;

const rejectPendingForWorker = (worker, error) => {
  for (const [id, handlers] of pending.entries()) {
    if (handlers.worker !== worker) continue;
    pending.delete(id);
    if (handlers.timer) clearTimeout(handlers.timer);
    handlers.reject(error);
  }
};

const createWorker = () => {
  const worker = new Worker(workerUrl, { type: 'module' });

  worker.on('message', (message) => {
    const { id, success, result, error } = message;
    const handlers = pending.get(id);
    if (!handlers) return;
    pending.delete(id);
    if (handlers.timer) clearTimeout(handlers.timer);
    if (success) handlers.resolve(result);
    else handlers.reject(new Error(error));
  });

  worker.on('error', (error) => {
    rejectPendingForWorker(worker, error);
  });

  worker.on('exit', (code) => {
    const error =
      code === 0 ? new Error('YAML worker exited unexpectedly') : new Error(`YAML worker exited with code ${code}`);

    rejectPendingForWorker(worker, error);

    if (isShuttingDown) return;

    const index = workers.indexOf(worker);
    if (index >= 0) workers[index] = createWorker();
  });

  return worker;
};

for (let i = 0; i < poolSize; i += 1) {
  workers.push(createWorker());
}

const runTask = (action, payload, options = {}) => {
  if (isShuttingDown) {
    return Promise.reject(new Error('YAML worker pool is shutting down'));
  }

  if (pending.size >= maxPendingTasks) {
    return Promise.reject(new Error('Too many pending YAML tasks'));
  }

  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const worker = workers[cursor];
    cursor = (cursor + 1) % workers.length;

    const timer = setTimeout(() => {
      const handlers = pending.get(id);
      if (!handlers) return;
      pending.delete(id);
      handlers.reject(new Error(`YAML task timed out after ${taskTimeoutMs}ms`));
      worker.terminate().catch(() => {});
    }, taskTimeoutMs);
    timer.unref?.();

    pending.set(id, { resolve, reject, worker, timer });

    try {
      worker.postMessage({ id, action, payload, options });
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      reject(error);
    }
  });
};

export const parseYAML = (content) => runTask('load', { content });

export const dumpYAML = (config, options = {}) => {
  const mergedOptions = {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    ...options
  };
  return runTask('dump', { config }, mergedOptions);
};

export const shutdownYamlWorkers = async () => {
  isShuttingDown = true;

  for (const [id, handlers] of pending.entries()) {
    pending.delete(id);
    if (handlers.timer) clearTimeout(handlers.timer);
    handlers.reject(new Error('YAML worker pool is shutting down'));
  }

  await Promise.allSettled(workers.map((worker) => worker.terminate()));
};
