"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminSession } from "@/components/AdminLayout";
import { apiFetch, csrfHeaders } from "@/lib/api";

type Project = { id: string; slug: string; name: string };
type SourceDocument = {
  id: string; original_url: string; final_url: string | null; title: string;
  publisher: string; published_at: string | null; fetched_at: string | null;
  mime_type: string | null; http_status: number | null; retrieval_method: string | null;
  robots_status: string | null; terms_status: string | null; parse_status: string;
  source_tier: string | null;
};
type Candidate = {
  id: string; project: Project; metric_type: string; raw_value: string | null;
  raw_unit: string | null; normalized_value: string | null; normalized_unit: string | null;
  missing_reason: string | null; period_start: string | null; period_end: string | null;
  effective_date: string | null; calendar_basis: string | null; fiscal_year_label: string | null;
  fiscal_year_start_month: number | null; period_type: string | null;
  production_stage: string | null; ownership_basis: string | null; confidence: string;
  status: "ready" | "needs_attention" | "ignored" | "published";
  blocking_issues: string[]; extraction_method: "fixture" | "deterministic" | "ai" | "manual";
  supersedes_observation_id: string | null; published_observation_id: string | null;
  confirmed_at: string | null; source: SourceDocument;
  evidence: { type: string; page_number: number | null; table_title: string | null; quoted_excerpt: string; locator: Record<string, unknown>; extraction_method: string };
};
type RunSummary = { id: string; status: string; project: Project; document_count: number; candidate_counts: Record<string, number>; created_at: string };
type RunDetail = { id: string; status: string; project: Project; documents: SourceDocument[]; candidates: Candidate[]; ai_extractor: { configured: boolean; model: string | null; note: string } };

const blankManual = {
  metric_type: "production", raw_value: "", raw_unit: "t", normalized_value: "", normalized_unit: "kt",
  period_start: "", period_end: "", effective_date: "", calendar_basis: "calendar_year",
  fiscal_year_label: "", fiscal_year_start_month: "", period_type: "annual",
  production_stage: "mine_contained_metal", ownership_basis: "project_100", confidence: "1.0",
  evidence_type: "pdf_page", page_number: "", evidence_locator: "", quoted_excerpt: "",
  extraction_method: "manual", source_title: "", publisher: "First Quantum Minerals Ltd.", source_published_at: "",
};

function candidateEdit(candidate: Candidate): Record<string, string> {
  return {
    raw_value: candidate.raw_value ?? "", raw_unit: candidate.raw_unit ?? "",
    normalized_value: candidate.normalized_value ?? "", normalized_unit: candidate.normalized_unit ?? "",
    period_start: candidate.period_start ?? "", period_end: candidate.period_end ?? "",
    effective_date: candidate.effective_date ?? "", calendar_basis: candidate.calendar_basis ?? "",
    fiscal_year_label: candidate.fiscal_year_label ?? "",
    fiscal_year_start_month: candidate.fiscal_year_start_month?.toString() ?? "",
    period_type: candidate.period_type ?? "", production_stage: candidate.production_stage ?? "",
    ownership_basis: candidate.ownership_basis ?? "", confidence: candidate.confidence,
    supersedes_observation_id: candidate.supersedes_observation_id ?? "",
  };
}

export function ResearchConsole() {
  const { handleAdminFailure } = useAdminSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [projectRef, setProjectRef] = useState("kansanshi");
  const [selectedRun, setSelectedRun] = useState("");
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [url, setUrl] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [manual, setManual] = useState(blankManual);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function fail(reason: unknown, fallback: string) {
    if (!handleAdminFailure(reason)) setError(reason instanceof Error ? reason.message : fallback);
  }
  async function loadRuns(preferred?: string) {
    const result = await apiFetch<{ items: RunSummary[] }>("/api/v1/admin/research/runs");
    setRuns(result.items);
    const id = preferred ?? selectedRun ?? result.items.find((item) => item.project.slug === "kansanshi")?.id ?? result.items[0]?.id;
    if (id) {
      setSelectedRun(id);
      const next = await apiFetch<RunDetail>(`/api/v1/admin/research/runs/${id}`);
      setDetail(next);
      setSourceId((current) => current || next.documents[0]?.id || "");
      setEdits(Object.fromEntries(next.candidates.map((item) => [item.id, candidateEdit(item)])));
    }
  }
  useEffect(() => {
    Promise.all([
      apiFetch<Project[]>("/api/v1/admin/research/projects"),
      apiFetch<{ items: RunSummary[] }>("/api/v1/admin/research/runs"),
    ]).then(([projectRows, runRows]) => {
      setProjects(projectRows);
      setRuns(runRows.items);
      const id = runRows.items.find((item) => item.project.slug === "kansanshi")?.id ?? runRows.items[0]?.id;
      if (id) {
        setSelectedRun(id);
        void apiFetch<RunDetail>(`/api/v1/admin/research/runs/${id}`).then((next) => {
          setDetail(next); setSourceId(next.documents[0]?.id ?? "");
          setEdits(Object.fromEntries(next.candidates.map((item) => [item.id, candidateEdit(item)])));
        });
      }
    }).catch((reason) => fail(reason, "资料研究页面加载失败"));
  }, []);

  async function createRun() {
    setBusy(true); setError("");
    try {
      const run = await apiFetch<{ id: string }>("/api/v1/admin/research/runs", { method: "POST", headers: csrfHeaders(), body: JSON.stringify({ project_ref: projectRef }) });
      setMessage("项目研究任务已创建。"); await loadRuns(run.id);
    } catch (reason) { fail(reason, "创建研究任务失败"); } finally { setBusy(false); }
  }
  async function selectRun(id: string) {
    setSelectedRun(id); setError("");
    try { await loadRuns(id); } catch (reason) { fail(reason, "研究任务加载失败"); }
  }
  async function addUrl() {
    if (!selectedRun || !url.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const source = await apiFetch<SourceDocument>(`/api/v1/admin/research/runs/${selectedRun}/documents`, { method: "POST", headers: csrfHeaders(), body: JSON.stringify({ url }) });
      setSourceId(source.id); setUrl(""); setMessage("来源文档已获取并保存。"); await loadRuns(selectedRun);
    } catch (reason) { fail(reason, "来源文档获取失败"); } finally { setBusy(false); }
  }
  async function deterministicExtract(id: string) {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ items: Candidate[] }>(`/api/v1/admin/research/documents/${id}/extract`, { method: "POST", headers: csrfHeaders(), body: JSON.stringify({ research_run_id: selectedRun }) });
      setMessage(result.items.length ? `确定性提取生成 ${result.items.length} 条候选。` : "没有发现可安全自动解释的句子，可使用下方人工结构化提取。等待人工补字段不代表在线 AI 已运行。");
      await loadRuns(selectedRun);
    } catch (reason) { fail(reason, "文档解析失败"); } finally { setBusy(false); }
  }
  async function createManualCandidate() {
    if (!sourceId) return;
    setBusy(true); setError("");
    const payload: Record<string, unknown> = { ...manual, research_run_id: selectedRun };
    if (!manual.normalized_value) delete payload.normalized_value;
    if (!manual.page_number) delete payload.page_number; else payload.page_number = Number(manual.page_number);
    if (!manual.fiscal_year_start_month) delete payload.fiscal_year_start_month; else payload.fiscal_year_start_month = Number(manual.fiscal_year_start_month);
    try {
      await apiFetch(`/api/v1/admin/research/documents/${sourceId}/candidates`, { method: "POST", headers: csrfHeaders(), body: JSON.stringify(payload) });
      setMessage("结构化候选已创建，请核对证据和口径后再发布。"); await loadRuns(selectedRun);
    } catch (reason) { fail(reason, "候选创建失败"); } finally { setBusy(false); }
  }
  async function candidateAction(candidate: Candidate, action: "publish" | "publish-modified" | "ignore" | "restore") {
    setBusy(true); setError(""); setMessage("");
    const init: RequestInit = { method: "POST", headers: csrfHeaders(), body: action === "publish-modified" ? JSON.stringify({ changes: edits[candidate.id] ?? {} }) : "{}" };
    try {
      await apiFetch(`/api/v1/admin/research/candidates/${candidate.id}/${action}`, init);
      setMessage(action.includes("publish") ? "候选已由管理员确认并在单个事务中发布。" : action === "ignore" ? "候选已暂不处理。" : "候选已恢复并重新校验。");
      await loadRuns(selectedRun);
    } catch (reason) { fail(reason, "候选操作失败"); } finally { setBusy(false); }
  }

  const selectedSource = useMemo(() => detail?.documents.find((item) => item.id === sourceId), [detail, sourceId]);
  return <div className="stack research-console">
    {message && <div className="notice success">{message}</div>}
    {error && <div className="notice error">{error}</div>}
    <section className="panel section">
      <div className="panel-head"><div><h2>项目研究队列</h2><span className="count">本轮首个试点：Kansanshi</span></div></div>
      <div className="research-toolbar">
        <label>项目<select className="select" value={projectRef} onChange={(event) => setProjectRef(event.target.value)}>{projects.map((item) => <option value={item.slug} key={item.id}>{item.name}</option>)}</select></label>
        <button className="button" disabled={busy} onClick={createRun}>创建研究任务</button>
        <label>已有任务<select className="select" value={selectedRun} onChange={(event) => void selectRun(event.target.value)}><option value="">请选择</option>{runs.map((item) => <option value={item.id} key={item.id}>{item.project.name} · {new Date(item.created_at).toLocaleString("zh-CN")}</option>)}</select></label>
      </div>
    </section>
    {detail && <>
      <section className="panel section">
        <div className="panel-head"><div><h2>官方来源文档</h2><span className="count">{detail.project.name} · URL 会执行 SSRF、重定向和 robots 检查</span></div></div>
        <div className="form"><label>官方公开 URL<input className="input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.first-quantum.com/..." /></label><button className="button copper" onClick={addUrl} disabled={busy || !url.trim()}>获取并保存文档</button></div>
        <div className="research-documents">{detail.documents.map((doc) => <article className="research-document" key={doc.id}><div><strong>{doc.title}</strong><div className="meta">{doc.publisher} · 发布 {doc.published_at ?? "待补"} · 获取 {doc.fetched_at ? new Date(doc.fetched_at).toLocaleString("zh-CN") : "—"}</div><div className="chips"><span className="chip">{doc.source_tier ?? "未分级"}级</span><span className="chip">{doc.mime_type}</span><span className="chip">{doc.parse_status}</span><span className="chip">robots: {doc.robots_status ?? "—"}</span></div></div><div className="actions"><a className="button secondary" href={doc.final_url ?? doc.original_url} target="_blank" rel="noopener noreferrer">打开原文 ↗</a><button className="button secondary" onClick={() => { setSourceId(doc.id); void deterministicExtract(doc.id); }} disabled={busy}>解析并确定性提取</button><button className="button" onClick={() => setSourceId(doc.id)}>用此文档创建候选</button></div></article>)}</div>
      </section>
      {selectedSource && <section className="panel section"><div className="panel-head"><div><h2>从证据创建结构化候选</h2><span className="count">extraction_method 明确标记；当前不伪装在线 AI</span></div></div><div className="form research-form-grid">
        {(["source_title","publisher","source_published_at","raw_value","raw_unit","normalized_value","normalized_unit","period_start","period_end","effective_date","fiscal_year_label","fiscal_year_start_month","page_number","evidence_locator","confidence"] as const).map((field) => <label key={field}>{field}<input className="input" value={manual[field]} onChange={(event) => setManual({ ...manual, [field]: event.target.value })} /></label>)}
        <label>calendar_basis<select className="select" value={manual.calendar_basis} onChange={(event) => setManual({ ...manual, calendar_basis: event.target.value })}><option value="calendar_year">calendar_year</option><option value="fiscal_year">fiscal_year</option></select></label>
        <label>period_type<select className="select" value={manual.period_type} onChange={(event) => setManual({ ...manual, period_type: event.target.value })}><option value="quarter">quarter</option><option value="ytd">ytd</option><option value="annual">annual</option><option value="other">other</option></select></label>
        <label>production_stage<select className="select" value={manual.production_stage} onChange={(event) => setManual({ ...manual, production_stage: event.target.value })}><option value="mine_contained_metal">mine_contained_metal</option><option value="concentrate_contained_metal">concentrate_contained_metal</option><option value="cathode">cathode</option><option value="anode_blister">anode_blister</option><option value="smelter_output">smelter_output</option></select></label>
        <label>ownership_basis<select className="select" value={manual.ownership_basis} onChange={(event) => setManual({ ...manual, ownership_basis: event.target.value })}><option value="project_100">project_100</option><option value="equity">equity</option><option value="attributable">attributable</option><option value="consolidated">consolidated</option><option value="unknown">unknown</option></select></label>
        <label>evidence_type<select className="select" value={manual.evidence_type} onChange={(event) => setManual({ ...manual, evidence_type: event.target.value })}><option value="pdf_page">pdf_page</option><option value="html_section">html_section</option><option value="table">table</option></select></label>
        <label>extraction_method<select className="select" value={manual.extraction_method} onChange={(event) => setManual({ ...manual, extraction_method: event.target.value })}><option value="manual">manual</option><option value="deterministic">deterministic</option><option value="fixture">fixture</option><option value="ai">ai</option></select></label>
        <label className="research-wide">quoted_excerpt<textarea rows={5} value={manual.quoted_excerpt} onChange={(event) => setManual({ ...manual, quoted_excerpt: event.target.value })} /></label>
        <button className="button copper" onClick={createManualCandidate} disabled={busy}>创建待确认候选</button>
      </div></section>}
      <section className="panel section"><div className="panel-head"><div><h2>候选数据与证据</h2><span className="count">{detail.candidates.length} 条 · 在线 AI {detail.ai_extractor.configured ? `已配置 ${detail.ai_extractor.model}` : "未配置"}</span></div></div><div className="research-candidates">{detail.candidates.map((candidate) => {
        const values = edits[candidate.id] ?? candidateEdit(candidate);
        return <article className={`research-candidate candidate-${candidate.status}`} key={candidate.id}><div className="research-candidate-head"><div><strong>{candidate.project.name} · {candidate.metric_type}</strong><div className="chips"><span className="chip">{candidate.status}</span><span className="chip">{candidate.extraction_method}</span><span className="chip">置信度 {candidate.confidence}</span><span className="chip">{candidate.source.source_tier ?? "未分级"}级来源</span></div></div>{candidate.published_observation_id && <a className="source-link" href={`/projects/${candidate.project.slug}`}>查看公开页面 →</a>}</div>
          <div className="evidence-box"><strong>证据</strong><p>{candidate.evidence.quoted_excerpt}</p><div className="meta">{candidate.evidence.type} · {candidate.evidence.page_number ? `PDF 第 ${candidate.evidence.page_number} 页` : JSON.stringify(candidate.evidence.locator)}</div><a className="source-link" href={candidate.source.final_url ?? candidate.source.original_url} target="_blank" rel="noopener noreferrer">{candidate.source.title} ↗</a></div>
          {candidate.blocking_issues.length > 0 && <div className="issue-panel critical"><strong>阻断问题</strong><ul>{candidate.blocking_issues.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          <div className="research-form-grid">{Object.entries(values).map(([field, value]) => <label key={field}>{field}<input className="input" value={value} disabled={candidate.status === "published"} onChange={(event) => setEdits({ ...edits, [candidate.id]: { ...values, [field]: event.target.value } })} /></label>)}</div>
          <div className="actions">{candidate.status === "ignored" ? <button className="button secondary" onClick={() => void candidateAction(candidate, "restore")}>恢复</button> : candidate.status !== "published" && <><button className="button copper" disabled={busy || candidate.status !== "ready"} onClick={() => void candidateAction(candidate, "publish")}>确认并发布</button><button className="button" disabled={busy} onClick={() => void candidateAction(candidate, "publish-modified")}>{candidate.supersedes_observation_id ? "确认修订并发布" : "修改并发布"}</button><button className="button secondary" disabled={busy} onClick={() => void candidateAction(candidate, "ignore")}>暂不处理</button></>}</div>
        </article>;
      })}{!detail.candidates.length && <div className="empty">尚无候选。先添加来源，再解析或人工结构化提取。</div>}</div></section>
      <div className="notice">{detail.ai_extractor.note}</div>
    </>}
  </div>;
}
