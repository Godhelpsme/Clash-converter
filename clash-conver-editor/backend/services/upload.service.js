import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { configDir } from './path.service.js';

const DEFAULT_UPLOAD_MAX_FILE_SIZE_MB = 5;
const MIN_UPLOAD_MAX_FILE_SIZE_MB = 1;

const parseUploadMaxFileSizeMb = (rawValue) => {
  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_UPLOAD_MAX_FILE_SIZE_MB;
  return Math.max(MIN_UPLOAD_MAX_FILE_SIZE_MB, parsed);
};

const uploadMaxFileSizeMb = parseUploadMaxFileSizeMb(process.env.UPLOAD_MAX_FILE_SIZE_MB);
const uploadMaxFileSizeBytes = uploadMaxFileSizeMb * 1024 * 1024;

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(configDir, { recursive: true });
      cb(null, configDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') cb(null, true);
  else {
    const error = new Error('Only YAML files are allowed');
    error.status = 400;
    cb(error);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: uploadMaxFileSizeBytes }
});
