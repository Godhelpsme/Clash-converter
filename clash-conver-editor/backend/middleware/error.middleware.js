import multer from 'multer';

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const isMulterError = typeof multer.MulterError === 'function' && err instanceof multer.MulterError;

  const status =
    err?.code === 'LIMIT_FILE_SIZE' ? 413 : isMulterError ? 400 : err?.status || 500;

  const message =
    isProd && status >= 500 ? 'Internal Server Error' : err?.message || 'Internal Server Error';

  return res.status(status).json({ success: false, error: message });
};

