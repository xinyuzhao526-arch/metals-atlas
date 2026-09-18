# 全球金属供给图谱

Phase 1A 验证 Excel 导入与发布闭环；Phase 1B.1 在此基础上增加人工发起的官方资料研究、证据候选、单次确认发布和公开来源展示。

## 项目状态

**Phase 1A — Completed（2026-09-17）**

Phase 1A 已完成并通过最终验证：

- Excel 模板、上传、详细差异预览、确认导入、待审核和接受并发布闭环已完成；
- ISO 3166-1 国家字典及受控、幂等的 `seed-countries` 维护流程已完成；
- 管理员身份显示、退出登录、会话过期和 CSRF 失效体验已完成；
- 管理端项目主数据目录、项目详情和导入历史/导入详情已完成；
- `铜矿_phase1a_import.xlsx` 的 44 条项目主数据已成功导入；
- 当前铜矿文件只有 `projects` 主数据，不包含产量、指引、储量等观察记录；
- 因此本次导入创建 0 条待审核观察记录，且不会令公开项目页面新增项目，这是预期行为。项目会在管理端 `/admin/projects` 中显示，只有具备已审核且已发布观察数据的项目才会进入公开页面。

**Phase 1B.1 — Completed（2026-09-18）**

- 已完成单项目、单来源、单候选的最小纵向闭环：人工创建研究任务 → 提交官方 URL → 安全获取并保存文档 → 提取证据候选 → 自动标准化与校验 → 管理员一次确认发布 → 公开来源抽屉；
- Kansanshi 首条官方真实数据已由管理员确认发布：First Quantum 2025 Q4 铜产量 47.655 kt；
- 本条记录的 `extraction_method=deterministic`，期间和数据口径经过管理员确认；
- AI 候选不会直接进入公开观察表，`ready / needs_attention / ignored / published` 是当前候选状态；
- 在线模型 API 尚未配置。ChatGPT/Codex 订阅不等于网站 API 凭据；在线模型和自动发现属于 Phase 1B.2。

## 快速开始

1. 复制 `.env.example` 为 `.env`，更换数据库密码、管理员密码和 `SESSION_SECRET`。
2. 运行 `docker compose config`。
3. 运行 `docker compose up --build -d`。
4. 运行 `docker compose exec api alembic upgrade head`。
5. 运行 `docker compose exec api python -m app.cli seed-countries`。
6. 运行 `docker compose exec api python -m app.cli create-admin`。
7. 打开 `http://localhost:3000/admin/login`。

资料研究入口为 `http://localhost:3000/admin/research`。Phase 1B.1 由管理员人工发起研究和提交 URL，不包含无人值守任务。

已有管理员需要重置密码时，运行 `docker compose exec api python -m app.cli reset-admin-password`。命令默认隐藏输入并要求确认；私人本地终端可添加 `--show-input` 显示输入。不要把密码作为命令参数、环境变量或文件内容传入。

模板可从管理端下载。示例工作簿位于 `fixtures/demo/phase1a-demo.xlsx`；它必须经过上传、确认导入和“接受并发布”，不会由迁移直接写入公开数据。

国家字典不是普通 Excel 导入表。受控参考数据位于 API 代码中，通过
`docker compose exec api python -m app.cli seed-countries` 幂等同步。新增国家时，
先按 ISO 3166-1 补齐 ISO2、ISO3、英文名、中文名和项目现有地区值，更新参考数据
版本并补充测试，再执行同步命令。项目和公司的国家引用必须使用 ISO3；同步遇到
非空字段冲突时会报告冲突，不会静默覆盖。

## 验证

```text
docker compose exec api pytest
cd apps/web
npm ci
npm run test:unit
npm run typecheck
npm run build
docker compose build web
```

API 启动后可运行真实 HTTP 闭环验证：

```text
cd apps/api
python scripts/verify_http_flow.py --workbook ../../fixtures/demo/phase1a-demo.xlsx
```

该脚本只通过登录、上传、预览、确认导入、审核和公开 API 操作数据，同时验证重复上传归类为“无变化”。

更多说明：

- [系统架构](docs/architecture.md)
- [数据库结构](docs/database.md)
- [Excel 使用说明](docs/excel-guide.md)
- [数据口径](docs/data-methodology.md)
- [部署与故障排查](docs/deployment.md)
- [后续路线图](docs/roadmap.md)

Phase 1B.1 不包含搜索引擎自动发现、在线模型调用、定时任务、批量发布、可信来源自动发布、地图或项目比较。
