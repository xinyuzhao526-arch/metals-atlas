"use client";
import { annualProductionFacts, missingFact, type SupplyConfig, type SupplyFact } from "@/lib/tin-iron-data";
export function factValue(f?: SupplyFact) {
  if (f?.value == null) return "待补";
  return f.value.toLocaleString("en-US") + (f.upper !== null ? "–" + f.upper.toLocaleString("en-US") : "") + " " + f.unit;
}
export function FactBlock({ fact:f, onSource, compact=false }: {fact?:SupplyFact;onSource:(id:string)=>void;compact?:boolean}) {
  if (!f || f.value === null) return <div className="supply-fact"><span className="missing-value">待补</span><small>{f?.missing_reason?.detail ?? missingFact.detail}</small>{f && <button type="button" className="evidence-link" onClick={()=>onSource(f.source_id)}>披露边界 ↗</button>}</div>;
  return <div className="supply-fact"><b>{factValue(f)}</b><small>{f.period.label}</small>{f.guidance_kind && <small>{({production:"生产指引",shipments:"发运指引",sales:"销售指引"})[f.guidance_kind]}</small>}<small>{f.ownership_basis}</small>{!compact && <small>{f.note}</small>}<button type="button" className="evidence-link" onClick={()=>onSource(f.source_id)}>来源 ↗</button></div>;
}

export function AnnualProductionBlock({config,projectId,onSource,compact=false}:{config:SupplyConfig;projectId:string;onSource:(id:string)=>void;compact?:boolean}) {
  const facts=annualProductionFacts(config,projectId);
  return <div className="supply-annual-facts">{facts.length ? facts.map(f=><FactBlock key={f.source_code+":"+f.record_key} fact={f} onSource={onSource} compact={compact}/>) : <FactBlock onSource={onSource} compact={compact}/>}</div>;
}
