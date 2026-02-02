import fs from 'fs/promises';
import path from 'path';
import { configDir } from './path.service.js';
import { dumpYAML } from './yaml.service.js';
import { getConfigFromCache } from './cache.service.js';
import { backupFileIfExists } from './backup.service.js';
import { isValidFilename } from '../validators/file.validator.js';

const createHttpError = (status, payload) => {
  const message = payload?.error || payload?.message || 'Error';
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
};

const isPathInside = (parentPath, childPath) => {
  const relative = path.relative(parentPath, childPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};

export const listConfigFiles = async () => {
  await fs.mkdir(configDir, { recursive: true });

  const entries = await fs.readdir(configDir, { withFileTypes: true });
  const yamlFiles = entries
    .filter((dirent) => dirent.isFile())
    .map((dirent) => dirent.name)
    .filter((name) => {
      const validExt = name.endsWith('.yaml') || name.endsWith('.yml');
      return validExt && isValidFilename(name);
    });

  const fileList = await Promise.all(
    yamlFiles.map(async (filename) => {
      const filePath = path.join(configDir, filename);
      const stats = await fs.stat(filePath);
      return {
        name: filename,
        path: filename,
        size: stats.size,
        modified: stats.mtime
      };
    })
  );

  return fileList;
};

const resolveExistingPath = async (filename) => {
  if (!isValidFilename(filename)) {
    throw createHttpError(400, { success: false, error: 'Invalid filename' });
  }

  await fs.mkdir(configDir, { recursive: true });
  const realConfigDir = await fs.realpath(configDir);

  const resolvedPath = path.resolve(path.join(configDir, filename));
  if (!isPathInside(realConfigDir, resolvedPath)) {
    throw createHttpError(403, { success: false, error: 'Access denied' });
  }

  let stats;
  try {
    stats = await fs.lstat(resolvedPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createHttpError(404, { success: false, error: 'File not found' });
    }
    throw error;
  }

  if (stats.isSymbolicLink()) {
    throw createHttpError(403, { success: false, error: 'Access denied' });
  }

  if (!stats.isFile()) {
    throw createHttpError(404, { success: false, error: 'File not found' });
  }

  return { resolvedPath, stats };
};

export const readConfigFile = async (filename) => {
  const { resolvedPath, stats } = await resolveExistingPath(filename);

  const content = await fs.readFile(resolvedPath, 'utf8');
  const config = await getConfigFromCache(resolvedPath, content, stats);

  return { filename, content, config };
};

export const saveConfigFile = async (filename, config) => {
  if (!isValidFilename(filename)) {
    throw createHttpError(400, { success: false, error: 'Invalid filename' });
  }

  await fs.mkdir(configDir, { recursive: true });
  const realConfigDir = await fs.realpath(configDir);
  const resolvedPath = path.resolve(path.join(configDir, filename));

  if (!isPathInside(realConfigDir, resolvedPath)) {
    throw createHttpError(403, { success: false, error: 'Access denied' });
  }

  try {
    const existing = await fs.lstat(resolvedPath);
    if (existing.isSymbolicLink()) {
      throw createHttpError(403, { success: false, error: 'Access denied' });
    }
    if (!existing.isFile()) {
      throw createHttpError(400, { success: false, error: 'Invalid file type' });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await backupFileIfExists(resolvedPath, filename);

  const yamlContent = await dumpYAML(config);
  await fs.writeFile(resolvedPath, yamlContent, 'utf8');

  return { filename };
};

export const deleteConfigFile = async (filename) => {
  const { resolvedPath } = await resolveExistingPath(filename);

  await backupFileIfExists(resolvedPath, filename);
  await fs.unlink(resolvedPath);

  return { filename };
};
