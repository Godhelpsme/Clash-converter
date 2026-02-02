import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const backendDir = path.resolve(__dirname, '..');
export const projectRoot = path.resolve(backendDir, '..');

export const configDir = path.join(projectRoot, 'configs');
export const backupDir = path.join(projectRoot, '.backups');
export const publicDir = path.join(backendDir, 'public');

