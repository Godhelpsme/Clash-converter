import fs from 'fs/promises';
import path from 'path';
import { backupDir } from './path.service.js';

const ensureBackupDir = async () => {
  await fs.mkdir(backupDir, { recursive: true });
};

const formatTimestamp = (date = new Date()) => date.toISOString().replace(/[:.]/g, '-');

export const backupFileIfExists = async (filePath, filename) => {
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  await ensureBackupDir();
  const backupName = `${filename}.${formatTimestamp()}.bak`;
  const backupPath = path.join(backupDir, backupName);

  await fs.copyFile(filePath, backupPath);
  return backupPath;
};

