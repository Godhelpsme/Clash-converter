import { parseYAML } from '../services/yaml.service.js';
import { validateConfig } from '../validators/config.validator.js';

export const parseConfig = async (req, res) => {
  try {
    const { content } = req.body || {};

    if (!content) {
      return res.status(400).json({ success: false, error: 'No content provided' });
    }

    const config = await parseYAML(content);
    res.json({ success: true, config });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Invalid YAML: ' + error.message });
  }
};

export const validateConfigHandler = async (req, res) => {
  const { config } = req.body || {};
  const result = validateConfig(config || {});

  res.json({
    success: true,
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
    errorDetails: result.errorDetails,
    warningDetails: result.warningDetails
  });
};
