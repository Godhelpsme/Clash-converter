import path from 'path';
import Joi from 'joi';

export const filenameSchema = Joi.string()
  .pattern(/^[a-zA-Z0-9_.-]+$/)
  .required();

export const filenameParamsSchema = Joi.object({
  filename: filenameSchema
});

export const saveFileSchema = Joi.object({
  filename: filenameSchema,
  config: Joi.object().required()
});

export const parseContentSchema = Joi.object({
  content: Joi.string().min(1).required()
});

export const configBodySchema = Joi.object({
  config: Joi.object().required()
});

export const isValidFilename = (filename) => {
  if (!filename || typeof filename !== 'string') {
    return false;
  }

  const normalized = path.normalize(filename);

  if (
    normalized.includes('..') ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    path.isAbsolute(normalized)
  ) {
    return false;
  }

  if (!/^[a-zA-Z0-9_\-.]+$/.test(filename)) {
    return false;
  }

  return true;
};

