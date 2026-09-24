"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectMap } from "@/components/ProjectMap";
import { PublicSourceDrawer } from "@/components/PublicSourceDrawer";
import {
  downloadCsv,
  formatMissing,
  projectCompleteness,
  projectFacts,
  publicData,
  sourceById,
  type InventoryFact,
  type PublicProject,
  type PublicSource,
} from "@/lib/public-data";

const statusLabel: Record<PublicProject["status"], string> = {
  operating: "运营中",
  development: "开发中",
  suspended: "暂停",
  closed: "关闭",
  unknown: "待核验",
};
const inventoryLabel: Record<string, string> = {
  total: "总库存",
  on_warrant: "可交割仓单",
  cancelled_warrants: "已取消仓单",
  weekly_inventory: "库存周报",
  warehouse_warrants: "仓单日报",
  registered: "Registered",
  eligible: "Eligible",
};
const eventLabel: Record<string, string> = {
  operational_disruption: "事故 · 停产 · 复产",
  guidance_adjustment: "指引调整",
};
const guidanceLabel: Record<string, string> = {
  maintained: "维持不变",
  tightened: "区间收窄",
};

function SourceLink({ id, onOpen }: { id: string | null; onOpen: (source: PublicSource) => void }) {
  const source = sourceById(id);
  if (!source) return null;
  return <button className="evidence-link" type="button" onClick={(event) => { event.stopPropagation(); onOpen(source); }}>来源 ↗</button>;
}

function FactValue({ value, suffix, reason }: { value: string | number | null; suffix?: string; reason?: string | null }) {
  if (value === null) return <span className="missing-value">{formatMissing(reason ?? "尚无已核验公开事实")}</span>;
  return <span>{value}{suffix ? ` ${suffix}` : ""}</span>;
}

function InventoryPlot({ records }: { records: InventoryFact[] }) {
  const points = records.filter((item) => item.normalized_value !== null);
  if (!points.length) return <div className="inventory-plot empty"><span>暂无可安全再分发的数值序列</span><small>定义和官方入口已保留，未用演示值填充。</small></div>;
  const values = points.map((item) => item.normalized_value as number);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, max * 0.08, 1);
  return <div className="inventory-plot">
    <svg viewBox="0 0 720 180" role="img" aria-label="库存离散数据点">
      {[30, 80, 130].map((y) => <line key={y} x1="34" y1={y} x2="700" y2={y} />)}
      {points.map((item, index) => {
        const x = points.length === 1 ? 360 : 50 + index * (630 / (points.length - 1));
        const y = 145 - (((item.normalized_value as number) - min) / range) * 105;
        return <g key={item.id}><circle cx={x} cy={y} r="7" /><text x={x} y={Math.max(18, y - 15)} textAnchor="middle">{(item.normalized_value as number).toLocaleString()}</text><text className="date" x={x} y="169" textAnchor="middle">{item.data_date}</text></g>;
      })}
    </svg>
    <p>仅显示已核验离散点；当前不足以绘制连续 30 / 90 天曲线。</p>
  </div>;
}

function projectRow(project: PublicProject) {
  const facts = projectFacts(project.id);
  const quarter = facts.production.filter((item) => item.period.type === "quarter").sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  const annual = facts.production.filter((item) => item.period.type === "annual").sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  const guidance = facts.guidance.sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  const reserve = facts.reserves.sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  const event = facts.events.sort((a, b) => b.reported_date.localeCompare(a.reported_date))[0];
  const completeness = projectCompleteness(project.id);
  const latestDate = [quarter?.effective_date, annual?.effective_date, guidance?.effective_date, reserve?.effective_date, event?.reported_date, project.verified_at].filter(Boolean).sort().at(-1) ?? project.verified_at;
  return { project, quarter, annual, guidance, reserve, event, completeness, latestDate };
}

export function PublicDataProduct() {
  const router = useRouter();
  const [source, setSource] = useState<PublicSource | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>("project-las-bambas");
  const [exchange, setExchange] = useState<InventoryFact["exchange"]>("LME");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [sort, setSort] = useState("updated_desc");

  const rows = useMemo(() => publicData.projects.map(projectRow), []);
  const countries = useMemo(() => Array.from(new Map(publicData.projects.map((item) => [item.country.iso3, item.country])).values()).sort((a, b) => a.name_zh.localeCompare(b.name_zh, "zh-CN")), []);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const q = search.trim().toLowerCase();
    if (q && !`${row.project.name} ${row.project.country.name_zh} ${row.project.operator ?? ""}`.toLowerCase().includes(q)) return false;
    if (country !== "all" && row.project.country.iso3 !== country) return false;
    if (status !== "all" && row.project.status !== status) return false;
    if (coverage !== "all" && !row.completeness[coverage as keyof typeof row.completeness]) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "name_asc") return a.project.name.localeCompare(b.project.name);
    if (sort === "country_asc") return a.project.country.name_zh.localeCompare(b.project.country.name_zh, "zh-CN");
    if (sort === "production_desc") return (b.quarter?.value ?? b.annual?.value ?? -1) - (a.quarter?.value ?? a.annual?.value ?? -1);
    return b.latestDate.localeCompare(a.latestDate);
  }), [country, coverage, rows, search, sort, status]);

  const mapProjects = filteredRows.map((row) => row.project);
  const selected = publicData.projects.find((item) => item.id === selectedProjectId) ?? null;
  const selectedFacts = selected ? projectFacts(selected.id) : null;
  const exchangeRecords = publicData.inventories.filter((item) => item.exchange === exchange);
  const latestInventory = exchangeRecords.find((item) => item.inventory_type === "total" && item.normalized_value !== null)
    ?? exchangeRecords.find((item) => item.normalized_value !== null)
    ?? exchangeRecords[0];
  const trendRecords = latestInventory ? exchangeRecords.filter((item) => item.inventory_type === latestInventory.inventory_type) : [];

  const exportMatrix = () => downloadCsv("metals-atlas-copper-research-matrix.csv", filteredRows.map(({ project, quarter, annual, guidance, reserve, event, latestDate }) => ({
    project_id: project.id,
    project: project.name,
    country: project.country.name_zh,
    status: project.status,
    operator: project.operator,
    latest_quarter_value: quarter?.value ?? null,
    latest_quarter_unit: quarter?.unit ?? null,
    annual_value: annual?.value ?? null,
    annual_unit: annual?.unit ?? null,
    guidance_low: guidance?.low ?? null,
    guidance_high: guidance?.high ?? null,
    reserve_ore_mt: reserve?.ore_tonnage ?? null,
    reserve_grade_pct: reserve?.grade_pct ?? null,
    latest_event: event?.headline_zh ?? null,
    data_date: latestDate,
  })));

  return <main className="terminal">
    <section className="research-strip" aria-labelledby="terminal-title">
      <div className="metal-ident"><span className="metal-symbol">Cu</span><div><p>铜供给研究终端</p><h1 id="terminal-title">Copper supply research</h1></div></div>
      <dl className="research-stats">
        <div><dt>数据核验</dt><dd>{publicData.updatedAt}</dd></div>
        <div><dt>项目覆盖</dt><dd>{publicData.coverage.project_count}</dd></div>
        <div><dt>已披露产量</dt><dd>{publicData.coverage.production_project_count} / {publicData.coverage.project_count} 项</dd></div>
        <div><dt>2026 指引覆盖</dt><dd>{publicData.coverage.guidance_coverage_pct}%</dd></div>
        <div><dt>近 30 天重大事件</dt><dd>{publicData.coverage.recent_event_count_30d}</dd></div>
      </dl>
      <div className="research-actions"><button type="button" onClick={() => setLibraryOpen(true)}>资料库 <span>{publicData.sources.length}</span></button><button type="button" onClick={exportMatrix}>导出 CSV</button></div>
      <p className="supply-thesis"><b>供给判断</b>{publicData.coverage.supply_summary_zh}</p>
      <div className="inventory-ticker" aria-label="最新三大交易所库存">
        {(["LME","SHFE","COMEX"] as const).map((name) => {
          const records = publicData.inventories.filter((record) => record.exchange === name);
          const item = records.find((record) => record.inventory_type === "total" && record.normalized_value !== null)
            ?? records.find((record) => record.normalized_value !== null);
          return <span key={name}><b>{name}</b>{item ? `${item.normalized_value?.toLocaleString()} t · ${item.data_date}` : "待补 · 授权/获取待确认"}</span>;
        })}
      </div>
    </section>

    <section className="supply-workbench">
      <div className="map-workspace">
        <div className="section-heading"><div><span>01 / 全球项目面</span><h2>矿山分布与数据密度</h2></div><p>点大小固定，不暗示产量；红色外圈代表已核验供给事件。</p></div>
        <div className="map-filterbar">
          <select aria-label="地图国家筛选" value={country} onChange={(e) => setCountry(e.target.value)}><option value="all">全部国家</option>{countries.map((item) => <option key={item.iso3} value={item.iso3}>{item.name_zh}</option>)}</select>
          <select aria-label="地图状态筛选" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">全部状态</option><option value="operating">运营中</option><option value="development">开发中</option><option value="suspended">暂停</option><option value="closed">关闭</option><option value="unknown">待核验</option></select>
          <select aria-label="地图数据完整度筛选" value={coverage} onChange={(e) => setCoverage(e.target.value)}><option value="all">全部完整度</option><option value="production">有产量</option><option value="guidance">有指引</option><option value="reserves">有储量</option><option value="event">有已核验事件</option></select>
          <span>{mapProjects.length} 个项目点</span>
        </div>
        <ProjectMap projects={mapProjects} selectedProjectId={selectedProjectId} eventProjectIds={publicData.events.map((item) => item.project_id)} onSelect={setSelectedProjectId} />
        <div className="map-legend"><span><i className="operating" />运营中</span><span><i className="development" />开发中</span><span><i className="suspended" />暂停</span><span><i className="closed" />关闭</span><span><i className="unknown" />待核验</span><span><i className="event-ring" />已核验事件</span></div>
        {selected && <div className="map-selection">
          <div><span>{selected.country.name_zh} · {statusLabel[selected.status]}</span><h3>{selected.name}</h3><p>{selected.operator ?? formatMissing(selected.operator_missing_reason)}</p></div>
          <dl><div><dt>产量</dt><dd>{selectedFacts?.production.length ? "已披露" : "待补"}</dd></div><div><dt>指引</dt><dd>{selectedFacts?.guidance.length ? "已披露" : "待补"}</dd></div><div><dt>储量</dt><dd>{selectedFacts?.reserves.length ? "已披露" : "待补"}</dd></div><div><dt>定位</dt><dd>{selected.location.precision === "approximate" ? "近似" : selected.location.precision}</dd></div></dl>
          <button type="button" onClick={() => router.push(`/projects/${selected.slug}`)}>打开项目档案 →</button>
        </div>}
      </div>

      <aside className="event-stream">
        <div className="section-heading"><div><span>02 / 供给动态</span><h2>时间流</h2></div><p>按披露日期倒序</p></div>
        <div className="event-type-key"><span>事故</span><span>停产</span><span>复产</span><span>指引</span><span>扩产</span><span>许可</span></div>
        {publicData.events.sort((a,b) => b.reported_date.localeCompare(a.reported_date)).map((event) => {
          const project = publicData.projects.find((item) => item.id === event.project_id);
          const active = selectedProjectId === event.project_id;
          return <article key={event.id} className={`stream-event ${active ? "active" : ""}`} onClick={() => setSelectedProjectId(event.project_id)}>
            <time>{event.reported_date}</time><div className="event-kind">{eventLabel[event.event_type] ?? event.event_type}</div><h3>{project?.name}</h3><h4>{event.headline_zh}</h4><p>{event.summary_zh}</p>
            <div className="event-milestones">
              {event.event_type === "guidance_adjustment" && <span>{event.event_start_date} 指引更新</span>}
              {event.event_type !== "guidance_adjustment" && <span>{event.event_start_date} 事故</span>}
              {event.operations_suspended_date && <span>{event.operations_suspended_date} 停产</span>}
              {event.operations_resumed_date && <span>{event.operations_resumed_date} 复产</span>}
            </div>
            <div className="event-sources">{event.source_ids.map((id) => <SourceLink key={id} id={id} onOpen={setSource} />)}</div>
          </article>;
        })}
        <div className="stream-empty"><b>其余类型暂无已核验事件</b><p>不使用新闻标题或演示事件填充时间流。</p></div>
      </aside>
    </section>

    <section className="inventory-terminal">
      <div className="section-heading"><div><span>03 / 仓库信号</span><h2>交易所库存，而非“全球库存”</h2></div><p>不同交易所与定义不相加；当前仅展示可追溯快照。</p></div>
      <div className="exchange-tabs">{(["LME","SHFE","COMEX"] as const).map((item) => <button key={item} className={exchange === item ? "active" : ""} type="button" onClick={() => setExchange(item)}>{item}</button>)}</div>
      <div className="inventory-body">
        <div className="inventory-latest"><span>最新可展示值</span><strong>{latestInventory?.normalized_value !== null && latestInventory?.normalized_value !== undefined ? latestInventory.normalized_value.toLocaleString() : "待补"} <small>{latestInventory?.normalized_value !== null ? "metric tonnes" : ""}</small></strong><p>数据日：{latestInventory?.data_date ?? "待补"}<br />环比：{latestInventory?.change_pct !== null && latestInventory?.change_pct !== undefined ? `${latestInventory.change_pct > 0 ? "+" : ""}${latestInventory.change_pct}%` : "待补"}<br />更新：{latestInventory?.published_at ?? "待补"}</p>{latestInventory && <SourceLink id={latestInventory.source_id} onOpen={setSource} />}</div>
        <InventoryPlot records={trendRecords} />
        <div className="inventory-definitions">{exchangeRecords.map((item) => <article key={item.id}><div><b>{inventoryLabel[item.inventory_type] ?? item.inventory_type}</b><span>{item.frequency}</span></div><strong>{item.value === null ? "待补" : `${item.value.toLocaleString()} ${item.original_unit}`}</strong><p>{item.notes}</p><small>{item.license_status}</small><SourceLink id={item.source_id} onOpen={setSource} /></article>)}</div>
      </div>
    </section>

    <section className="matrix-section">
      <div className="section-heading"><div><span>04 / 项目研究矩阵</span><h2>把缺口和事实放在同一视野</h2></div><p>{filteredRows.length} / {publicData.projects.length} 个项目</p></div>
      <div className="matrix-toolbar">
        <input aria-label="搜索项目" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索项目、国家或运营方" />
        <select aria-label="国家筛选" value={country} onChange={(e) => setCountry(e.target.value)}><option value="all">全部国家</option>{countries.map((item) => <option key={item.iso3} value={item.iso3}>{item.name_zh}</option>)}</select>
        <select aria-label="运营状态筛选" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">全部状态</option><option value="operating">运营中</option><option value="development">开发中</option><option value="suspended">暂停</option><option value="closed">关闭</option><option value="unknown">待核验</option></select>
        <select aria-label="数据覆盖筛选" value={coverage} onChange={(e) => setCoverage(e.target.value)}><option value="all">全部数据</option><option value="production">有产量</option><option value="guidance">有指引</option><option value="reserves">有储量</option><option value="event">有近期事件</option></select>
        <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value)}><option value="updated_desc">最新更新时间</option><option value="production_desc">产量</option><option value="country_asc">国家</option><option value="name_asc">项目名</option></select>
        <button type="button" onClick={exportMatrix}>导出当前 CSV</button>
      </div>
      <div className="matrix-table-wrap"><table className="research-matrix"><thead><tr><th>项目</th><th>国家</th><th>运营方</th><th>最新季度产量</th><th>年度累计 / 全年</th><th>当前指引</th><th>指引状态</th><th>储量</th><th>最新事件</th><th>数据日期</th><th>核验</th></tr></thead><tbody>{filteredRows.map(({ project, quarter, annual, guidance, reserve, event, latestDate, completeness }) => <tr key={project.id} onClick={() => router.push(`/projects/${project.slug}`)}>
        <td><b>{project.name}</b><span>{statusLabel[project.status]}</span></td><td>{project.country.name_zh}</td><td><FactValue value={project.operator} reason={project.operator_missing_reason} /></td>
        <td><FactValue value={quarter?.value ?? null} suffix={quarter?.unit} /><small>{quarter?.period.label ?? "季度产量尚无已核验来源"}</small>{quarter && <SourceLink id={quarter.source_id} onOpen={setSource} />}</td>
        <td><FactValue value={annual?.value ?? null} suffix={annual?.unit} /><small>{annual?.period.label ?? "年度产量尚无已核验来源"}</small>{annual && <SourceLink id={annual.source_id} onOpen={setSource} />}</td>
        <td>{guidance ? <><b>{guidance.low}–{guidance.high} {guidance.unit}</b><small>{guidance.period.label}</small><SourceLink id={guidance.source_id} onOpen={setSource} /></> : <span className="missing-value">待补 / 指引未录入</span>}</td>
        <td>{guidance ? (guidanceLabel[guidance.guidance_kind] ?? "当前指引") : "待补"}</td>
        <td>{reserve ? <><b>{reserve.ore_tonnage} {reserve.ore_tonnage_unit} @ {reserve.grade_pct}% Cu</b><small>{reserve.classification}</small><SourceLink id={reserve.source_id} onOpen={setSource} /></> : <span className="missing-value">待补 / 储量未录入</span>}</td>
        <td>{event?.headline_zh ?? "待补 / 无近期已核验事件"}{event && <SourceLink id={event.source_id} onOpen={setSource} />}</td><td>{latestDate}</td><td><span className={`coverage-dot ${completeness.production ? "verified" : ""}`}>{completeness.production ? "事实已核验" : "主数据已录入"}</span></td>
      </tr>)}</tbody></table></div>
      <div className="matrix-cards">{filteredRows.map(({ project, quarter, guidance, reserve, event }) => <article key={project.id} onClick={() => router.push(`/projects/${project.slug}`)}>
        <header><div><b>{project.name}</b><span>{project.country.name_zh}</span></div><em>{statusLabel[project.status]}</em></header>
        <p>{project.operator ?? formatMissing(project.operator_missing_reason)}</p>
        <dl><div><dt>季度产量</dt><dd><FactValue value={quarter?.value ?? null} suffix={quarter?.unit} /></dd></div><div><dt>指引</dt><dd>{guidance ? `${guidance.low}–${guidance.high} ${guidance.unit}` : "待补"}</dd></div><div><dt>储量</dt><dd>{reserve ? `${reserve.ore_tonnage} ${reserve.ore_tonnage_unit}` : "待补"}</dd></div></dl>
        <small>{event?.headline_zh ?? "无近期已核验事件"}</small>
      </article>)}</div>
    </section>

    {libraryOpen && <div className="source-library-backdrop" onClick={() => setLibraryOpen(false)}><section className="source-library" role="dialog" aria-modal="true" aria-label="资料库" onClick={(e) => e.stopPropagation()}>
      <header><div><span>资料库</span><h2>公开证据索引</h2><p>来源按事实入口打开，不在首页复刻大表。</p></div><button type="button" onClick={() => setLibraryOpen(false)} aria-label="关闭资料库">×</button></header>
      <div>{publicData.sources.map((item) => <button key={item.id} type="button" onClick={() => { setLibraryOpen(false); setSource(item); }}><span className={`tier tier-${item.tier.toLowerCase()}`}>{item.tier}</span><div><b>{item.title}</b><small>{item.organization} · {item.publication_date ?? "日期待补"}</small><em>{item.locator}</em></div><i>查看 →</i></button>)}</div>
    </section></div>}
    <PublicSourceDrawer source={source} onClose={() => setSource(null)} />
  </main>;
}
