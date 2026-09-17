# 系统架构

Phase 1A 是单体仓库中的三个 Compose 服务：`web`（Next.js）、`api`（FastAPI）和 `postgres`（PostgreSQL）。浏览器只访问公开 API 与带认证的管理 API；API 负责所有校验和状态转换；数据库是唯一业务事实来源。上传的 xlsx 保存到本地 Docker Volume，数据库只保存文件路径、哈希、预览结果和应用结果。

数据流固定为：模板下载 → 上传文件 → 逐行标准化与分类 → 整批确认 → 观察记录进入 `pending/unpublished` → 管理员审核 → `approved/published` → 公开 API。预览或确认不会绕过审核。存在冲突或校验失败时，整批确认被拒绝。

认证仅支持一个管理员。密码使用 Argon2id 哈希；会话使用 HttpOnly 签名 Cookie；写操作同时校验 CSRF Cookie 与 `X-CSRF-Token`。生产环境必须替换示例密钥并启用 HTTPS/Secure Cookie。

## Phase 1A 边界

本期没有地图、采集器、任务队列、Redis、S3、完整 RBAC、完整审计日志、不可变版本或发布批次。详见 [roadmap.md](roadmap.md)。

