# 系统架构

系统是单体仓库中的三个 Compose 服务：`web`（Next.js）、`api`（FastAPI）和 `postgres`（PostgreSQL）。浏览器只访问公开 API 与带认证的管理 API；API 负责所有校验和状态转换；数据库是唯一业务事实来源。上传的 xlsx 和允许归档的来源文档分别保存到本地 Docker Volume，数据库保存元数据、哈希、定位和状态。

数据流固定为：模板下载 → 上传文件 → 逐行标准化与分类 → 整批确认 → 观察记录进入 `pending/unpublished` → 管理员审核 → `approved/published` → 公开 API。预览或确认不会绕过审核。存在冲突或校验失败时，整批确认被拒绝。

Phase 1B.1 资料研究数据流为：管理员创建 research run → 人工提交官方 URL → 安全获取、哈希去重和归档 → PDF/HTML 解析 → 证据与候选 → 标准化和阻断校验 → 管理员一次确认并发布 → 公开 API 和来源抽屉。候选永远不会自动写入公开观察表。

发布在一个数据库事务中完成：创建已批准且公开的 observation、关联 evidence/candidate、创建已完成的兼容 ReviewItem、更新 candidate 状态和管理员确认时间。任一步骤失败均回滚；已完成的兼容 ReviewItem 不进入待审核列表。

认证仅支持一个管理员。密码使用 Argon2id 哈希；会话使用 HttpOnly 签名 Cookie；写操作同时校验 CSRF Cookie 与 `X-CSRF-Token`。生产环境必须替换示例密钥并启用 HTTPS/Secure Cookie。

## 当前边界

Phase 1B.1 的 Extractor 接口支持 `fixture`、`deterministic`、`manual` 和未来的 `ai` 标记，但当前没有在线模型供应商实现或 API Key。自动发现、定时任务、Redis、S3、完整 RBAC、批量发布、地图和项目比较不在本阶段。详见 [roadmap.md](roadmap.md)。
