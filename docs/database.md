# 数据库说明

所有业务主键为 UUID 字符串，时间戳按 UTC 保存，数量使用 `numeric`。迁移由 Alembic 管理。

| 表 | 用途 | 关键约束 |
|---|---|---|
| `metals` | 金属字典 | `code` 唯一 |
| `countries` | 国家与地区字典 | ISO2、ISO3 唯一 |
| `companies` | 公司主数据 | 标准名唯一；财年起始月 1–12 |
| `projects` | 项目主数据 | `slug` 唯一 |
| `project_ownership` | 项目持股及有效期 | 比例 0–100；同项目、公司、起始日唯一；区间重叠由服务层拒绝 |
| `sources` | 一份具体来源材料 | `code` 唯一；保存原始/最终 URL、机构、标题、发布日期、获取时间、SHA-256、MIME、状态、来源等级和本地归档相对路径 |
| `research_runs` | 人工发起的项目研究任务 | 关联项目、发起管理员、目标指标和任务状态 |
| `research_discoveries` | 研究任务发现或人工提交的 URL | 同一任务内规范化 URL 唯一 |
| `source_fetch_attempts` | 每次来源获取尝试 | 保存 HTTP 状态、重定向链、失败/限速状态和错误 |
| `document_evidence` | 文档内具体证据 | 来源文档与 locator hash 唯一；支持 PDF 页码和 HTML/表格/字段定位 |
| `research_candidates` | 尚未确认或已经发布的结构化候选 | 状态为 `ready / needs_attention / ignored / published`；候选指纹唯一 |
| `production_observations` | 产量观察 | `(source_code, record_key)` 唯一；research candidate 唯一关联 |
| `guidance_observations` | 指引观察 | `(source_code, record_key)` 唯一；上下限校验；research candidate 唯一关联 |
| `reserve_observations` | 储量/资源量观察 | `(source_code, record_key)` 唯一；research candidate 唯一关联 |
| `review_items` | 发布操作留痕 | Phase 1A 保存待审核项；Phase 1B.1 同步创建已完成记录，不进入待审核列表 |
| `import_jobs` | 上传批次 | 文件哈希、路径、状态和预览汇总 |
| `import_rows` | 上传逐行结果 | 原始值、标准化值、分类、错误和应用记录 ID |
| `users` | 单管理员账户 | 邮箱唯一 |

三张观察表共同保存项目、金属、来源、原始/标准化值与单位、缺失原因、期间、有效日期、自然年/财年、期间类型、所有权口径、生产环节、证据定位、核验日期、审核状态、公开状态与 `row_version`。数值为空时 `missing_reason` 必填；缺失值绝不转换为零。

Phase 1B.1 为三张观察表增加 `evidence_id`、`research_candidate_id`、`supersedes_id`、`is_current`、`superseded_at`、`confirmed_by` 和 `confirmed_at`。同一 research candidate 最多创建一条同类型 observation；修订通过 `supersedes_id` 保留旧记录与来源链路，不静默覆盖。

当前迁移版本为 `6f2c9b8e4a11`。该迁移只增加结构，不清理 demo，也不改写 Phase 1A 项目主数据。

`source_code` 与 `source_id` 对应材料的 `sources.code` 一致性由导入和研究发布服务保证并由测试验证。Phase 1A 没有声称数据库能单独阻止所有持股区间重叠。
