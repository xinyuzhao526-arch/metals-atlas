# 数据库说明

所有业务主键为 UUID 字符串，时间戳按 UTC 保存，数量使用 `numeric`。迁移由 Alembic 管理。

| 表 | 用途 | 关键约束 |
|---|---|---|
| `metals` | 金属字典 | `code` 唯一 |
| `countries` | 国家与地区字典 | ISO2、ISO3 唯一 |
| `companies` | 公司主数据 | 标准名唯一；财年起始月 1–12 |
| `projects` | 项目主数据 | `slug` 唯一 |
| `project_ownership` | 项目持股及有效期 | 比例 0–100；同项目、公司、起始日唯一；区间重叠由服务层拒绝 |
| `sources` | 一份具体来源材料 | `code` 唯一；保存机构、标题、具体 URL、发布日期、类型、核验日期和 demo 标志 |
| `production_observations` | 产量观察 | `(source_code, record_key)` 唯一 |
| `guidance_observations` | 指引观察 | `(source_code, record_key)` 唯一；上下限校验 |
| `reserve_observations` | 储量/资源量观察 | `(source_code, record_key)` 唯一 |
| `review_items` | Phase 1A 审核项 | 每条观察记录一个审核项；保存修改前后快照 |
| `import_jobs` | 上传批次 | 文件哈希、路径、状态和预览汇总 |
| `import_rows` | 上传逐行结果 | 原始值、标准化值、分类、错误和应用记录 ID |
| `users` | 单管理员账户 | 邮箱唯一 |

三张观察表共同保存项目、金属、来源、原始/标准化值与单位、缺失原因、期间、有效日期、自然年/财年、期间类型、所有权口径、生产环节、证据定位、核验日期、审核状态、公开状态与 `row_version`。数值为空时 `missing_reason` 必填；缺失值绝不转换为零。

`source_code` 与 `source_id` 对应材料的 `sources.code` 一致性由导入服务保证并由测试验证。Phase 1A 没有声称数据库能单独阻止所有持股区间重叠。

