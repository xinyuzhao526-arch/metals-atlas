"use client";
import { missingFact, type SupplyFact } from "@/lib/tin-iron-data";
export function factValue(f?: SupplyFact) {
  if (f?.value == null) return "待补";
  return f.value.toLocaleString("en-US") + (f.upper !== null ? "–" + f.upper.toLocaleString("en-US") : "") + " " + f.unit;
}
export function FactBlock({ fact:f, onSource, compact=false }: {fact?:SupplyFact;onSource:(id:string)=>void;compact?:boolean}) {
  if (!f || f.value === null) return <div className="supply-fact"><span className="missing-value">待补</span><small>{f?.missing_reason?.detail ?? missingFact.detail}</small>{f && <button type="button" className="evidence-link" onClick={()=>onSource(f.source_id)}>披露边界 ↗</button>}</div>;
  return <div className="supply-fact"><b>{factValue(f)}</b><small>{f.period.label}</small><small>{f.ownership_basis}</small>{!compact && <small>{f.note}</small>}<button type="button" className="evidence-link" onClick={()=>onSource(f.source_id)}>来源 ↗</button></div>;
}
