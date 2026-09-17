# Excel 使用说明

模板包含 `_README`、`_LOOKUPS`、`projects`、`companies`、`ownership`、`production`、`guidance`、`reserves` 和 `sources`。列名与顺序不可更改，空白行会被忽略。

国家不是普通 Excel 导入表，模板不会提供 `countries` 工作表，上传也不会创建或
修改国家。国家字典由版本化受控参考数据维护；新增国家时，应核对 ISO 3166-1
ISO2/ISO3、英文标准名称、中文名称及现有地区取值，更新参考清单与测试，然后运行
`docker compose exec api python -m app.cli seed-countries`。命令以 ISO3 为稳定唯一
键：新增缺失记录、跳过一致记录、补充允许为空的字段，并报告而不覆盖冲突。

新模板的 `_LOOKUPS` 国家列表来自数据库当前可用字典。项目与公司的
`country_iso3` 必须填写 ISO3，不按中文名称模糊匹配；未知 ISO3 会在预览阶段按
工作表和行号标记为“校验失败”，不会等到确认阶段，也不会自动创建国家。

`record_id` 与 `row_version` 用于受控更新；新增记录可留空。观察表必须填写 `source_code` 与稳定的 `record_key`。同一来源中的同一业务事实应长期复用同一 `record_key`。

观察字段规则：

- 数值缺失时保持空白，并填写 `missing_reason`；明确披露的零才填写 0。
- `calendar_basis` 为 `calendar_year` 或 `fiscal_year`；财年必须同时填写财年标签和 1–12 的起始月。
- `period_type` 为季度、YTD、年度或其他枚举值。
- `ownership_basis` 明确区分项目 100%、权益、应占和合并口径。
- `production_stage` 明确区分矿端含金属、精矿含金属、阴极、阳极/粗铜和冶炼产出。
- 每条观察记录填写有效日期、来源发布日期、来源定位和核验日期。

预览分类为新增、更新、无变化、冲突和校验失败。UUID/稳定键指向不同记录、`row_version` 过期或工作簿内稳定键内容不一致均为冲突。存在冲突或校验失败时默认阻止整批确认。确认后的观察记录固定进入待审核且不可公开。
