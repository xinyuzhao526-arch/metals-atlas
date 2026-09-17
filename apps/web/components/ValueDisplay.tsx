const reasons: Record<string, string> = {
  not_disclosed: "来源未披露",
  awaiting_verification: "等待人工核验",
  not_collected: "尚未采集",
  under_review: "审核中",
  human_verified_pending: "等待补充核验",
};

export function ValueDisplay({ value, unit, missingReason }: { value: string | null; unit: string; missingReason: string | null }) {
  if (value === null) {
    return <div><span className="missing">待补</span><div className="meta">{reasons[missingReason ?? ""] ?? missingReason ?? "缺失原因未记录"}</div></div>;
  }
  return <div className="value">{Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 3 })} <small>{unit}</small></div>;
}

