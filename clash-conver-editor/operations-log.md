# operations-log.md

> 说明：本文件用于记录 Codex 在本仓库内的关键操作留痕（时间为中国时区 UTC+8）。

## 2026-02-02 01:47（UTC+8）

- 工具：functions.mcp__time__get_current_time（timezone=Asia/Shanghai）→ 获取时间戳 `2026-02-02T01:47:43+08:00`
- 工具：functions.shell_command（Get-ChildItem / Get-Content / rg / node -p 等）→ 扫描项目结构与关键配置：`package.json`、`docker-compose.yml`、`backend/server.js`、`frontend/vite.config.js`、`frontend/public/config-metadata.json` 等
- 发现：原 `README.md` 的中文部分存在乱码；Docker Compose 依赖 `frontend/dist`，需先执行 `npm run build`
- 工具：functions.apply_patch → 重写 `README.md`（中文、补全启动/部署/配置/API/目录结构）；新增本 `operations-log.md`

## 2026-02-02 01:53（UTC+8）

- 工具：functions.mcp__time__get_current_time（timezone=Asia/Shanghai）→ 获取时间戳 `2026-02-02T01:53:42+08:00`
- 工具：functions.apply_patch → 补充 `README.md` 的鉴权启动提示，并更新“最后更新”时间戳
