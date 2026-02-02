const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../frontend/dist');
const targetDir = path.join(__dirname, '../backend/public');

if (!fs.existsSync(sourceDir)) {
  console.error('未找到 frontend/dist，请先执行 npm run build:frontend。');
  process.exit(1);
}

if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  console.log('已删除旧的 backend/public 目录');
}

fs.cpSync(sourceDir, targetDir, { recursive: true });
console.log('已复制 frontend/dist 到 backend/public');
console.log(`源目录: ${sourceDir}`);
console.log(`目标目录: ${targetDir}`);
