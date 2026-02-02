import Joi from 'joi';

const proxySchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().required(),
  server: Joi.string().required(),
  port: Joi.number().integer().min(1).max(65535).required()
}).unknown(true);

const proxyGroupSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string()
    .valid('select', 'url-test', 'fallback', 'load-balance', 'relay')
    .required(),
  proxies: Joi.array().items(Joi.string()).min(1).required(),
  url: Joi.string().optional(),
  interval: Joi.number().integer().min(1).optional(),
  tolerance: Joi.number().integer().min(0).optional()
}).unknown(true);

const configSchema = Joi.object({
  mode: Joi.string().valid('rule', 'global', 'direct').optional(),
  port: Joi.number().integer().min(1).max(65535).optional(),
  'socks-port': Joi.number().integer().min(1).max(65535).optional(),
  'mixed-port': Joi.number().integer().min(1).max(65535).optional(),
  proxies: Joi.array().items(proxySchema).optional(),
  'proxy-groups': Joi.array().items(proxyGroupSchema).optional(),
  rules: Joi.array().items(Joi.string()).optional(),
  dns: Joi.object({
    enable: Joi.boolean().optional(),
    nameserver: Joi.array().items(Joi.string()).optional(),
    fallback: Joi.array().items(Joi.string()).optional()
  }).optional()
}).unknown(true);

export const validateConfig = (config) => {
  const errors = [];
  const warnings = [];
  const errorDetails = [];
  const warningDetails = [];

  const pushError = (message, detail = {}) => {
    errors.push(message);
    errorDetails.push({
      message,
      ...detail
    });
  };

  const pushWarning = (message, detail = {}) => {
    warnings.push(message);
    warningDetails.push({
      message,
      ...detail
    });
  };

  const { error } = configSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true
  });

  if (error) {
    error.details.forEach((detail) => {
      const keyPath = detail.path.join('.');
      if (keyPath === 'port') {
        pushError('HTTP端口 (port) 必须在 1-65535 之间', { type: 'config', field: 'port' });
        return;
      }
      if (keyPath === 'socks-port') {
        pushError('SOCKS端口 (socks-port) 必须在 1-65535 之间', { type: 'config', field: 'socks-port' });
        return;
      }
      if (keyPath === 'mixed-port') {
        pushError('混合端口 (mixed-port) 必须在 1-65535 之间', { type: 'config', field: 'mixed-port' });
        return;
      }
      if (keyPath === 'proxies') {
        pushError('代理列表 (proxies) 必须是数组', { type: 'proxies', field: 'proxies' });
        return;
      }
      if (keyPath === 'proxy-groups') {
        pushError('代理组 (proxy-groups) 必须是数组', { type: 'proxy-groups', field: 'proxy-groups' });
        return;
      }
      if (keyPath === 'rules') {
        pushError('规则列表 (rules) 必须是数组', { type: 'rules', field: 'rules' });
        return;
      }
      pushError(detail.message);
    });
  }

  if (!config.mode) {
    pushWarning('运行模式 (mode) 未指定，将使用默认值', { type: 'config', field: 'mode' });
  } else if (!['rule', 'global', 'direct'].includes(config.mode)) {
    pushError('运行模式 (mode) 必须是 rule、global 或 direct 之一', { type: 'config', field: 'mode' });
  }

  if (Array.isArray(config.proxies)) {
    config.proxies.forEach((proxy, index) => {
      if (!proxy.name) {
        pushError(`代理 #${index + 1}: 缺少 name 字段`, { type: 'proxy', index, field: 'name' });
      }
      if (!proxy.type) {
        pushError(`代理 "${proxy.name || index + 1}": 缺少 type 字段`, {
          type: 'proxy',
          index,
          field: 'type'
        });
      }
      if (!proxy.server) {
        pushError(`代理 "${proxy.name || index + 1}": 缺少 server 字段`, {
          type: 'proxy',
          index,
          field: 'server'
        });
      }
      if (!proxy.port) {
        pushError(`代理 "${proxy.name || index + 1}": 缺少 port 字段`, {
          type: 'proxy',
          index,
          field: 'port'
        });
      } else if (proxy.port < 1 || proxy.port > 65535) {
        pushError(`代理 "${proxy.name || index + 1}": port 必须在 1-65535 之间`, {
          type: 'proxy',
          index,
          field: 'port'
        });
      }
    });
  } else {
    pushWarning('未配置代理 (proxies)', { type: 'proxies', field: 'proxies' });
  }

  if (Array.isArray(config['proxy-groups'])) {
    config['proxy-groups'].forEach((group, index) => {
      if (!group.name) {
        pushError(`代理组 #${index + 1}: 缺少 name 字段`, { type: 'proxy-group', index, field: 'name' });
      }
      if (!group.type) {
        pushError(`代理组 "${group.name || index + 1}": 缺少 type 字段`, {
          type: 'proxy-group',
          index,
          field: 'type'
        });
      } else if (!['select', 'url-test', 'fallback', 'load-balance', 'relay'].includes(group.type)) {
        pushError(
          `代理组 "${group.name || index + 1}": type 必须是 select、url-test、fallback、load-balance 或 relay 之一`,
          { type: 'proxy-group', index, field: 'type' }
        );
      }
      if (!group.proxies || !Array.isArray(group.proxies) || group.proxies.length === 0) {
        pushError(`代理组 "${group.name || index + 1}": 必须包含至少一个代理`, {
          type: 'proxy-group',
          index,
          field: 'proxies'
        });
      }
    });
  } else {
    pushWarning('未配置代理组 (proxy-groups)', { type: 'proxy-groups', field: 'proxy-groups' });
  }

  if (Array.isArray(config.rules)) {
    if (config.rules.length === 0) {
      pushWarning('规则列表 (rules) 为空', { type: 'rules', field: 'rules' });
    }
    config.rules.forEach((rule, index) => {
      if (typeof rule !== 'string') {
        pushError(`规则 #${index + 1}: 必须是字符串`, { type: 'rule', index, field: 'rule' });
      } else if (rule.split(',').length < 2) {
        pushError(`规则 #${index + 1} "${rule}": 格式不正确`, { type: 'rule', index, field: 'rule' });
      }
    });
  } else {
    pushWarning('未配置规则 (rules)，所有流量将使用默认策略', {
      type: 'rules',
      field: 'rules'
    });
  }

  if (config.dns && config.dns.enable === true) {
    if (
      !config.dns.nameserver ||
      !Array.isArray(config.dns.nameserver) ||
      config.dns.nameserver.length === 0
    ) {
      pushWarning('DNS已启用但未配置 nameserver', { type: 'dns', field: 'nameserver' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    errorDetails,
    warningDetails
  };
};
