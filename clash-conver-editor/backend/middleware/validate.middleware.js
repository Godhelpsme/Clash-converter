export const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    allowUnknown: true
  });

  if (error) {
    const message = error.details.map((d) => d.message).join('; ');
    return res.status(400).json({ success: false, error: message });
  }

  req.body = value;
  next();
};

export const validateParams = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.params, {
    abortEarly: false,
    allowUnknown: true
  });

  if (error) {
    const message = error.details.map((d) => d.message).join('; ');
    return res.status(400).json({ success: false, error: message });
  }

  req.params = value;
  next();
};

