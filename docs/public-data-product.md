# 公开数据产品优先：对比、最小改造与部署方案

## 1. 产品对比（2026-09-18 只读分析）

参考站点：`https://xinyuzhao526-arch.github.io/PaiPaiMetals/`

| 能力 | PaiPaiMetals | 改造前 MetalsAtlas | 本轮处理 |
|---|---|---|---|
| 顶部/侧栏金属切换 | 侧栏 Cu、Al、Pb/Zn、Ni、Sn、Li、Fe；切换主题和整页数据 | 只有 Cu 标识，无品种切换 | 增加 Cu 主入口及禁用态扩展位，避免伪造其他品种数据 |
| 总览 | 标题、核验状态、近期事件、库存、地图、榜单集中在单页 | 首页只有项目搜索和项目卡片 | 改为公开铜数据总览，首屏直接展示 Las Bambas 四个核心事实 |
| 世界地图 | Leaflet + Esri/OSM，地图点与榜单联动 | 无地图 | 使用 Leaflet + OSM，展示 44 个项目；坐标全部明确标记为近似定位 |
| 近期供给事件 | 事件卡片，点击打开详情与来源 | 无事件展示/模型 | 用版本化 `events.json` 展示 2026-08 事故、暂停与复产，并关联官方、Reuters、Mining Weekly |
| 交易所库存 | 按交易所展示数值并可打开来源 | 无 | 横向趋势面板区分 SHFE 周库存/仓单、LME total/on-warrant/cancelled、COMEX registered/eligible/total；不可安全取得的值保持 null |
| 公司/项目产量追踪 | 可搜索、按地区/产量排序、表格与地图联动 | 只有项目目录和三类观察列表 | 改为 44 项目研究矩阵，支持搜索、国家/状态/数据覆盖筛选、排序和 CSV |
| 来源组织 | 统一来源表，点击打开抽屉，可复制/打开 URL | 来源只分散在项目观察记录中 | 指标旁入口、项目来源标签、统一右侧抽屉和资料库弹层，不在首页堆叠来源大表 |
| 详情抽屉 | 事件、库存、地图点、项目行、来源均可打开抽屉 | 只有观察来源抽屉 | 首页和详情页统一使用公开来源抽屉 |
| CSV 导出 | 浏览器生成当前筛选结果 CSV | 无 | 首页和 Las Bambas 详情页均可直接导出 CSV |
| 移动端 | 侧栏转为顶部，栅格改单列，表格横向滚动 | 基础单列适配 | 复刻该响应式信息架构，但使用 Metals Atlas 自己的品牌与文案 |
| 数据与来源关联 | 页面脚本内对象通过链接字段关联，偏单文件 | PostgreSQL 观察表通过 source 外键关联，公开页运行时依赖 FastAPI | 新增稳定 `project_id` / `source_id` 的静态 JSON 合约；数据库事实与编辑型数据可并存 |

### 页面结构与交互结论

PaiPaiMetals 是“单页核验工作台”：深色侧栏承担品牌、金属切换和锚点导航；主区按事件/库存 → 地图/榜单 → 项目追踪 → 来源总表自上而下组织。信息密度高，所有核心对象都能打开右侧抽屉，CSV 在浏览器本地生成；1100px 以下转成单列布局。

改造前 MetalsAtlas 是“公开 API 的薄前端”：首页查询 FastAPI，列出已经发布的项目；详情按产量、指引、储量三组展示，来源抽屉做得较完整，但没有事件、库存、地图、统一来源表、CSV 或无需后端的部署路径。它的数据语义更严格，但用户第一眼看到的信息量和可访问性明显不足。

### 已落实的公开终端方向

1. 顶部研究摘要直接显示核验日、覆盖项目、指引覆盖率、近期事件和库存日期。
2. 首屏为 65/35 的地图与事件流，地图只读取公开坐标，不接触后台。
3. 库存使用独立趋势面板，不把不同交易所或不同定义相加。
4. 44 项目研究矩阵支持筛选、排序、地图联动、详情页和浏览器端 CSV。
5. 来源通过指标入口、项目标签、资料库和统一抽屉组织。
6. 事件和股权继续使用版本化 JSON，避免扩展复杂数据库；移动端改为项目卡片和底部来源面板。

没有复制第三方 MetalsGoWhere 的名称、Logo、品牌表达或成段文案。当前视觉使用矿物米灰、深石墨、氧化铜绿和陶土色，并采用编辑型研究终端布局。

## 2. Las Bambas 发布核验

四条指定候选在本轮检查时已经由现有正式发布服务发布，无需重复调用：

- `f1147010-dd5c-4d81-be4f-d0cb50e86a8a`：2026 Q2，109.192 kt。
- `ea21b5d9-6050-44c8-8a08-23507e42603f`：2025 全年，410.834 kt。
- `56184c31-6989-4dd5-b811-36dc5241b660`：2026 指引 380–400 kt，维持不变。
- `6e0ed7e7-1d88-47ca-b416-63254e7ff9fc`：880 Mt @ 0.53% Cu，Proved + Probable；contained metal 为 `null/not_disclosed`。

四条均为 A 级 MMG/HKEX 来源、`blocking_issues=[]`、项目/期间/单位/环节/口径明确、包含 PDF 页码，且没有重复 observation。候选 `464ffdf8-09c0-40aa-8888-0993d5c45a71` 仍为 `ignored`，未发布、未恢复。

## 3. 静态公开数据层

实际目录为 `apps/web/data/`，由 Next.js 构建时打包：

```text
apps/web/data/
├─ projects.json
├─ production.json
├─ guidance.json
├─ reserves.json
├─ events.json
├─ inventories.json
├─ coverage.json
└─ sources.json
```

数据库已发布事实可以由 `/api/v1/public/projects/{slug}` 导出；运营方、股权、项目定位和事件暂时作为版本控制的编辑数据维护。当前公开层包含 44 个项目，其中 Las Bambas 与 Kansanshi 具备产量、指引和储量事实；其余项目保留明确的缺失原因。两类数据在合并前必须通过稳定 ID 和数据测试。公开文件不包含 Cookie、管理员信息、数据库文件、本地路径、抓取缓存或内部备注。

后续最小流水线：Codex 检索公开材料 → 更新/生成 JSON → 数据测试（ID、来源、null 语义、敏感字段）→ Next 静态构建 → 人工查看构建产物 → GitHub Pages 发布。当前阶段不增加定时器、任务队列或自动审批。

## 4. 部署方案

### A. Next.js + FastAPI/PostgreSQL 本地运行

- 命令保持不变：`docker compose up --build -d`。
- 管理后台与数据库只在本地使用；现有导入、研究候选和正式发布服务均保留。
- 公开首页现在不依赖运行时 API，因此即使 API 暂停，构建后的公开内容仍可查看。
- 本地管理后台继续依赖 FastAPI/PostgreSQL；公开页面不依赖运行时 API。

### B. Next.js 静态导出 + GitHub Pages（优先）

- `npm run build:pages` 生成 `apps/web/out/`，并在上传前移除整个 `out/admin/` 目录。
- `.github/workflows/pages.yml` 运行数据测试、类型检查和静态构建，再上传 Pages artifact。
- 配置会从 `GITHUB_REPOSITORY` 自动推导项目站点的 `basePath`；用户站点仓库（`*.github.io`）不加前缀。
- 合并到 `main` 后，公开地址为 `https://xinyuzhao526-arch.github.io/metals-atlas/`。GitHub 仓库 Settings → Pages → Source 选择 **GitHub Actions**，首次可手动运行 workflow。
- Pages 只上传 `apps/web/out/`；不上传 PostgreSQL 数据目录、数据库文件、管理员接口、环境文件或凭据。

## 5. 本轮边界

保留 FastAPI/PostgreSQL 和本地管理后台，没有继续建设多层审核、完整审计、复杂事件表、Celery/Redis、模型 API、定时任务、自动搜索基础设施或新权限系统。后续优先扩充公开项目和可核验数据文件，再决定是否把成熟字段回写数据库模型。
