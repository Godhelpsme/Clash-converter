# Clash Config Editor（Clash / Mihomo 配置可视化编辑器）

> 最后更新：2026-02-02 01:53（UTC+8）｜执行：Codex

一个基于 Web 的 Clash / Mihomo 配置文件可视化编辑器：支持配置文件管理、表单化编辑、代理节点批量导入、YAML 预览与校验，并提供可选登录鉴权。

## 功能特性

- 配置文件管理：列出/上传/读取/保存/删除 `configs/` 下的 `.yaml/.yml`
- 可视化编辑：按模块编辑（基础/网络/TUN/DNS/嗅探/代理/代理组/规则）
- 代理节点导入：粘贴分享链接批量解析并写入配置（vless/vmess/ss/ssr/trojan/hysteria/hysteria2/hy2/tuic）
- YAML 预览：保存前查看生成的 YAML
- 配置校验：保存前进行后端校验，并在界面定位错误
- 自动备份：保存/删除前会将旧文件备份到 `.backups/`
- 可选鉴权：用户名/密码登录；本地开发默认关闭，Docker Compose 默认开启

## 技术栈

- 前端：Vue 3、Vite、Element Plus、Pinia、Vue Router
- 后端：Node.js（ESM）、Express、Joi、js-yaml、worker_threads
- 部署：Docker（多阶段构建）、Docker Compose（Nginx + Backend）

## 快速开始

### 方式 A：本地开发（前后端热更新）

前置：Node.js 18+、npm

```bash
# 安装依赖（根目录用于 concurrently；frontend/backend 各自安装运行依赖）
npm install
cd frontend && npm install
cd ../backend && npm install

# 同时启动前端(5173) + 后端(3000)
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000

Windows 也可以直接运行 `start.bat`。

### 方式 B：本地生产运行（不使用 Docker）

```bash
# 构建前端并复制到 backend/public
npm run build

# 启动后端（同时托管前端静态资源）
npm start
```

访问：http://localhost:3000

### 方式 C：Docker（单容器）

```bash
docker build -f Dockerfile.optimized -t clash-config-editor .
docker run -p 3000:3000 -v ./configs:/app/configs -v ./.backups:/app/.backups clash-config-editor
```

如需开启登录鉴权，请通过 `-e` 传入 `AUTH_*` 相关环境变量（见下文“配置说明”）。

### 方式 D：Docker Compose（Nginx + Backend）

1）复制并配置环境变量（Windows PowerShell 可用 `Copy-Item .env.example .env`）：

```bash
cp .env.example .env
```

2）生成 `frontend/dist`（Docker Compose 会将其挂载到 Nginx 容器）：

```bash
npm run build
```

3）启动：

```bash
docker-compose up -d
```

访问：http://localhost:${PORT}（默认 3000）

Windows 也可以直接运行 `start-docker.bat`。

## 配置说明（环境变量）

`.env` 主要用于 `docker-compose` 变量替换；本地运行可用系统环境变量注入。

> 注意：当 `AUTH_ENABLED=true` 且 `NODE_ENV=production`（Docker 镜像默认如此）时，必须显式设置 `AUTH_USERNAME`、`AUTH_PASSWORD`、`AUTH_JWT_SECRET`；否则后端会拒绝启动。Docker Compose 在变量缺失时也会直接报错退出。

- `PORT`：对外访问端口（docker-compose 将其映射到 Nginx 80）
- `TRUST_PROXY`：反代场景下信任 `X-Forwarded-*`
- `AUTH_ENABLED`：是否启用登录鉴权（`true/false`）
- `AUTH_USERNAME` / `AUTH_PASSWORD`：登录账号密码（生产/Compose 场景必填）
- `AUTH_JWT_SECRET`：JWT 签名密钥（生产/Compose 场景必填）
- `AUTH_JWT_TTL_MS` / `AUTH_TOKEN_TTL_MS`：Token 过期时间（毫秒）
- `ALLOWED_ORIGINS`：允许的 CORS 来源（逗号分隔）；同源部署可留空
- `UPLOAD_MAX_FILE_SIZE_MB`：上传大小限制（MB）
- `YAML_WORKER_POOL_SIZE`：YAML Worker 线程数
- `YAML_TASK_TIMEOUT_MS`：YAML 任务超时（毫秒）
- `YAML_MAX_PENDING`：最多排队 YAML 任务数
- `YAML_MAX_ALIAS_COUNT`：YAML alias 数限制

## API（`/api`）

鉴权开启时，除 `/api/auth/status`、`/api/auth/login` 外，其余接口都需要先登录。

### Auth

- `GET /api/auth/status`
- `POST /api/auth/login`
- `GET /api/auth/verify`
- `POST /api/auth/logout`

### Files

- `GET /api/files/list`
- `POST /api/files/upload`（`multipart/form-data`，字段名 `file`）
- `GET /api/files/read/:filename`
- `POST /api/files/save`
- `DELETE /api/files/:filename`

### Config

- `POST /api/config/parse`
- `POST /api/config/validate`

## 目录结构

```text
.
├─ backend/         # Express API + 生产静态资源托管（backend/public）
├─ frontend/        # Vue3 + Vite
├─ configs/         # 配置文件目录（.yaml/.yml）
├─ .backups/        # 自动备份目录（保存/删除前生成）
├─ docker/          # Nginx 配置等
└─ scripts/         # 构建辅助脚本（copy-dist 等）
```

## 测试

```bash
cd backend
npm test
```

## License

MIT
