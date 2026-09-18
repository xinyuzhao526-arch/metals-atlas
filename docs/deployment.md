# 运行与部署

复制 `.env.example` 为不提交 Git 的 `.env`，替换数据库密码、管理员密码和至少 32 字符的随机会话密钥。生产环境应使用 HTTPS，并将 Cookie Secure 配置纳入部署覆盖。

```text
docker compose config
docker compose up --build -d
docker compose exec api alembic upgrade head
docker compose exec api python -m app.cli create-admin
docker compose exec api pytest
```

Phase 1B.1 使用 `sources_data` Volume 保存允许归档的官方 PDF/HTML 原文件，并通过 `SOURCE_STORAGE_DIR=/data/sources` 指向容器内存储目录。备份 PostgreSQL 时应同步备份该 Volume；公共 API 永远不返回本地相对路径。

当前部署没有在线模型供应商实现，也不需要模型 API Key。未来 Phase 1B.2 接入在线模型时，使用独立的网站 API 凭据和模型名配置（预留字段为 `EXTRACTION_API_KEY`、`EXTRACTION_MODEL`），不得复用个人 ChatGPT/Codex 登录、Cookie 或订阅凭据，也不得提交到仓库。

本地管理员密码重置使用 `docker compose exec api python -m app.cli reset-admin-password`，并在两个提示中输入相同的新密码。默认隐藏输入；私人本地终端可添加 `--show-input` 显示输入。不要通过命令参数、环境变量或日志传递密码。

前端镜像构建阶段会先运行类型检查再执行生产构建。主机验证命令：

```text
cd apps/web
npm ci
npm run test:unit
npm run typecheck
npm run build
```

健康检查：`GET /health/live` 检查进程，`GET /health/ready` 检查数据库连接。故障排查顺序：查看 `docker compose ps`、数据库健康状态、`docker compose logs api`、迁移版本和上传 Volume 权限。不要把真实密码、Cookie 或 Token 写入日志或仓库。
