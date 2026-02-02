import fs from 'fs/promises';
import {
  listConfigFiles,
  readConfigFile,
  saveConfigFile,
  deleteConfigFile
} from '../services/file.service.js';
import { upload } from '../services/upload.service.js';
import { parseYAML } from '../services/yaml.service.js';
import { logger } from '../services/logger.service.js';
import { isValidFilename } from '../validators/file.validator.js';

export const listFiles = async (req, res) => {
  try {
    const files = await listConfigFiles();
    res.json({ success: true, files });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to list files' });
  }
};

export const uploadMiddleware = upload.single('file');

export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const content = await fs.readFile(req.file.path, 'utf8');
    await parseYAML(content);

    const requestLogger = req.log || logger;
    requestLogger.info(
      {
        action: 'files.upload',
        filename: req.file.filename,
        size: req.file.size
      },
      '文件上传并通过 YAML 校验'
    );

    res.json({
      success: true,
      file: {
        name: req.file.filename,
        path: req.file.filename,
        size: req.file.size
      }
    });
  } catch (error) {
    const requestLogger = req.log || logger;
    requestLogger.warn(
      {
        action: 'files.upload_failed',
        filename: req.file?.filename,
        size: req.file?.size,
        error: error?.message
      },
      '文件上传失败或 YAML 校验失败'
    );

    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(400).json({ success: false, error: 'Invalid YAML file: ' + error.message });
  }
};

export const readFile = async (req, res) => {
  try {
    const filename = req.params.filename;

    if (!isValidFilename(filename)) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    const data = await readConfigFile(filename);
    res.json({ success: true, ...data });
  } catch (error) {
    if (error.status && error.payload) {
      return res.status(error.status).json(error.payload);
    }
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'File not found' });
    } else {
      res.status(400).json({ success: false, error: 'Failed to read file' });
    }
  }
};

export const saveFile = async (req, res) => {
  try {
    const { filename, config } = req.body || {};

    if (!filename || !config) {
      return res.status(400).json({ success: false, error: 'Missing filename or config' });
    }

    if (!isValidFilename(filename)) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    if (!(filename.endsWith('.yaml') || filename.endsWith('.yml'))) {
      return res.status(400).json({ success: false, error: 'Filename must end with .yaml or .yml' });
    }

    await saveConfigFile(filename, config);

    const requestLogger = req.log || logger;
    requestLogger.info(
      {
        action: 'files.save',
        filename
      },
      '文件保存成功'
    );

    res.json({
      success: true,
      message: 'File saved successfully',
      filename
    });
  } catch (error) {
    const requestLogger = req.log || logger;
    requestLogger.error(
      {
        action: 'files.save_failed',
        filename: req.body?.filename,
        error: error?.message
      },
      '文件保存失败'
    );

    if (error.status && error.payload) {
      return res.status(error.status).json(error.payload);
    }
    res.status(500).json({ success: false, error: 'Failed to save file' });
  }
};

export const deleteFile = async (req, res) => {
  try {
    const filename = req.params.filename;

    if (!isValidFilename(filename)) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    await deleteConfigFile(filename);

    const requestLogger = req.log || logger;
    requestLogger.info(
      {
        action: 'files.delete',
        filename
      },
      '文件删除成功'
    );

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    if (error.status && error.payload) {
      return res.status(error.status).json(error.payload);
    }
    if (error.code === 'ENOENT') {
      const requestLogger = req.log || logger;
      requestLogger.warn(
        {
          action: 'files.delete_not_found',
          filename: req.params.filename
        },
        '文件删除失败：文件不存在'
      );
      res.status(404).json({ success: false, error: 'File not found' });
    } else {
      const requestLogger = req.log || logger;
      requestLogger.error(
        {
          action: 'files.delete_failed',
          filename: req.params.filename,
          error: error?.message
        },
        '文件删除失败'
      );
      res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  }
};
