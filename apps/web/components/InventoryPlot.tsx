type InventoryPoint = {id:string;normalized_value:number|null;data_date:string|null;frequency:string};

export function InventoryPlot({ records }: { records: InventoryPoint[] }) {
  const points = records
    .filter((item) => item.normalized_value !== null && item.data_date !== null)
    .sort((a, b) => (a.data_date ?? "").localeCompare(b.data_date ?? ""));
  if (!points.length) return <div className="inventory-plot empty"><span>暂无可安全再分发的数值序列</span><small>定义和官方入口已保留，未用演示值填充。</small></div>;
  const values = points.map((item) => item.normalized_value as number);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, max * 0.08, 1);
  const plotted = points.map((item, index) => ({
    item,
    x: points.length === 1 ? 360 : 50 + index * (630 / (points.length - 1)),
    y: 145 - (((item.normalized_value as number) - min) / range) * 105,
  }));
  const connectSeries = points.length > 1 && points.every((item) => item.frequency === "daily" || item.frequency === "weekly");
  return <div className="inventory-plot">
    <svg viewBox="0 0 720 180" role="img" aria-label="库存离散数据点">
      {[30, 80, 130].map((y) => <line key={y} x1="34" y1={y} x2="700" y2={y} />)}
      {connectSeries && <polyline className="inventory-trend-line" points={plotted.map(({ x, y }) => `${x},${y}`).join(" ")} />}
      {plotted.map(({ item, x, y }, index) => {
        const showLabel = points.length <= 6 || index === 0 || index === points.length - 1;
        return <g key={item.id}><circle cx={x} cy={y} r={points.length > 10 ? "4.5" : "7"} />{showLabel && <><text x={x} y={Math.max(18, y - 15)} textAnchor="middle">{(item.normalized_value as number).toLocaleString()}</text><text className="date" x={x} y="169" textAnchor="middle">{item.data_date}</text></>}</g>;
      })}
    </svg>
    <p>{connectSeries ? `按披露日期连接 ${points.length} 个同定义数据点；非交易日不插值。` : "仅显示已核验快照；数据频率或授权不足时不连线。"}</p>
  </div>;
}
