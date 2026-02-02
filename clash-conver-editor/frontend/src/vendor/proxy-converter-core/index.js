// clash-config-editor/frontend/src/vendor/proxy-converter-core/index.js
import VLESSParser from './parsers/vless-parser.js';
import VMessParser from './parsers/vmess-parser.js';
import SSParser from './parsers/ss-parser.js';
import TrojanParser from './parsers/trojan-parser.js';
import Hysteria2Parser from './parsers/hysteria2-parser.js';
import SSRParser from './parsers/ssr-parser.js';
import HysteriaParser from './parsers/hysteria-parser.js';
import TUICParser from './parsers/tuic-parser.js';

import VLESSConverter from './converters/vless-converter.js';
import VMessConverter from './converters/vmess-converter.js';
import SSConverter from './converters/ss-converter.js';
import TrojanConverter from './converters/trojan-converter.js';
import Hysteria2Converter from './converters/hysteria2-converter.js';
import SSRConverter from './converters/ssr-converter.js';
import HysteriaConverter from './converters/hysteria-converter.js';
import TUICConverter from './converters/tuic-converter.js';

const PROTOCOL_ALIASES = {
  hy2: 'hysteria2',
  shadowsocks: 'ss',
};

const parserMap = {
  vless: new VLESSParser(),
  vmess: new VMessParser(),
  ss: new SSParser(),
  trojan: new TrojanParser(),
  hysteria2: new Hysteria2Parser(),
  ssr: new SSRParser(),
  hysteria: new HysteriaParser(),
  tuic: new TUICParser(),
};

const converterMap = {
  vless: new VLESSConverter(),
  vmess: new VMessConverter(),
  ss: new SSConverter(),
  trojan: new TrojanConverter(),
  hysteria2: new Hysteria2Converter(),
  ssr: new SSRConverter(),
  hysteria: new HysteriaConverter(),
  tuic: new TUICConverter(),
};

function normalizeProtocol(raw) {
  const p = String(raw || '').trim().toLowerCase();
  return PROTOCOL_ALIASES[p] || p;
}

export function parseProxyLink(link) {
  const raw = String(link || '').trim();
  if (!raw) return { success: false, error: '无效的代理链接' };

  const proto = normalizeProtocol(raw.split('://')[0]);
  const parser = parserMap[proto];
  const converter = converterMap[proto];

  if (!parser || !converter) {
    return { success: false, error: `不支持的协议: ${proto || '(unknown)'}` };
  }

  // proxy-converter 的 parser/convert 都以"尽量不抛异常"为目标，但这里仍做兜底。
  try {
    const node = parser.parse(raw);
    const proxy = converter.convert(node);
    return { success: true, proxy, warnings: node?.warnings || [] };
  } catch (error) {
    return { success: false, error: error?.message ? String(error.message) : String(error) };
  }
}

export function parseBatchProxyLinks(lines) {
  const proxies = [];
  const errors = [];

  (Array.isArray(lines) ? lines : String(lines || '').split('\n')).forEach((line, index) => {
    const trimmed = String(line || '').trim();
    if (!trimmed || !trimmed.includes('://')) return;

    const result = parseProxyLink(trimmed);
    if (result.success) {
      proxies.push(result.proxy);
    } else {
      errors.push({
        line: index + 1,
        link: trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed,
        error: result.error,
      });
    }
  });

  return { proxies, errors };
}
