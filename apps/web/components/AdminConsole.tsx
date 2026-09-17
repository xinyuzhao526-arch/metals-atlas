"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminSession } from "@/components/AdminLayout";
import {
  businessSummary,
  classificationNames,
  classificationOrder,
  confirmationFailureMessage,
  ConfirmationResponse,
  confirmationSuccessMessage,
  filterPreviewRows,
  ImportHistoryItem,
  JsonRecord,
  Preview,
  PreviewDiff,
  PreviewRow,
} from "@/lib/admin-preview";
import { apiFetch, apiRequest, csrfHeaders } from "@/lib/api";

type Review = {
  id: string;
  observation_type: string;
  observation_id: string;
  status: string;
  before: JsonRecord | null;
  after: JsonRecord | null;
  comment: string | null;
};

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function FieldDiff({ diff }: { diff: PreviewDiff }) {
  const entries = Object.entries(diff);
  if (!entries.length) return <div className="meta">没有字段级变化。</div>;
  return (
    <div className="diff-list">
      {entries.map(([field, change]) => (
        <div className="diff-row" key={field}>
          <strong>{field}</strong>
          <code>{display(change.before)}</code>
          <span aria-hidden="true">→</span>
          <code>{display(change.after)}</code>
        </div>
      ))}
    </div>
  );
}

function PreviewRecord({ row }: { row: PreviewRow }) {
  const summary = businessSummary(row);
  const issues = [...row.errors, ...row.warnings];
  const critical = row.classification === "conflict" || row.classification === "invalid";
  return (
    <details className={`preview-record ${critical ? "preview-record-critical" : ""}`}>
      <summary className="preview-record-summary">
        <span className="preview-location"><strong>{row.sheet}</strong><span>第 {row.row_number} 行</span></span>
        <span className={`classification classification-${row.classification}`}>
          {classificationNames[row.classification] ?? row.classification}
        </span>
        <span className="preview-business">
          <strong>{summary.title}</strong>
          <span>{summary.fields.map((field) => `${field.label}：${field.value}`).join(" · ")}</span>
        </span>
        <span className={issues.length ? "preview-issues has-issues" : "preview-issues"}>
          {issues.length ? issues.join("；") : "无错误或警告"}
        </span>
      </summary>
      <div className="preview-record-details">
        {issues.length > 0 && (
          <section className={critical ? "issue-panel critical" : "issue-panel"}>
            <h3>错误或警告</h3>
            <ul>{issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul>
          </section>
        )}
        {row.before && (
          <section>
            <h3>字段差异（before → after）</h3>
            <FieldDiff diff={row.diff} />
          </section>
        )}
        <div className="json-grid">
          <section><h3>原始 JSON</h3><pre>{json(row.raw)}</pre></section>
          <section><h3>标准化 JSON</h3><pre>{json(row.normalized)}</pre></section>
          {row.before && <section><h3>匹配前数据库数据</h3><pre>{json(row.before)}</pre></section>}
        </div>
      </div>
    </details>
  );
}

export function AdminConsole() {
  const { handleAdminFailure } = useAdminSession();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [imports, setImports] = useState<ImportHistoryItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetFilter, setSheetFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");
  const [keyword, setKeyword] = useState("");

  function reportFailure(reason: unknown, fallback: string) {
    if (handleAdminFailure(reason)) return;
    setError(reason instanceof Error ? reason.message : fallback);
  }

  function loadReviews() {
    apiFetch<Review[]>("/api/v1/admin/reviews")
      .then(setReviews)
      .catch((reason) => reportFailure(reason, "待审核数据加载失败"));
  }

  function loadImports() {
    apiFetch<{ items: ImportHistoryItem[] }>("/api/v1/admin/imports")
      .then((result) => setImports(result.items))
      .catch((reason) => reportFailure(reason, "导入历史加载失败"));
  }

  useEffect(() => {
    loadReviews();
    loadImports();
  }, []);

  async function downloadTemplate() {
    setError("");
    try {
      const response = await apiRequest("/api/v1/admin/excel/template");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "metals-atlas-phase1a-template.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      reportFailure(reason, "模板下载失败");
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const uploaded = await apiFetch<{ id: string }>("/api/v1/admin/imports", {
        method: "POST",
        headers: { "X-CSRF-Token": sessionStorage.getItem("csrf_token") ?? "" },
        body,
      });
      setPreview(await apiFetch<Preview>(`/api/v1/admin/imports/${uploaded.id}/preview`));
      loadImports();
      setSheetFilter("");
      setClassificationFilter("");
      setKeyword("");
    } catch (reason) {
      reportFailure(reason, "上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const confirmed = await apiFetch<ConfirmationResponse>(`/api/v1/admin/imports/${preview.id}/confirm`, {
        method: "POST",
        headers: csrfHeaders(),
        body: "{}",
      });
      setMessage(confirmationSuccessMessage(confirmed.result));
      setPreview({ ...preview, status: confirmed.status, confirmed_at: confirmed.confirmed_at });
      loadReviews();
      loadImports();
    } catch (reason) {
      if (!handleAdminFailure(reason)) {
        const detail = reason instanceof Error ? reason.message : "确认导入失败";
        setError(confirmationFailureMessage(detail));
      }
    } finally {
      setBusy(false);
    }
  }

  async function reviewAction(id: string, action: "accept-and-publish" | "reject") {
    setError("");
    try {
      await apiFetch(`/api/v1/admin/reviews/${id}/${action}`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({
          comment: action === "accept-and-publish" ? "管理员接受并发布" : "管理员拒绝",
        }),
      });
      setMessage(action === "accept-and-publish" ? "记录已接受并发布。" : "记录已拒绝。");
      loadReviews();
    } catch (reason) {
      reportFailure(reason, "审核操作失败");
    }
  }

  async function modifyAndPublish(item: Review) {
    const reason = window.prompt(
      "修改 missing_reason（留空表示清除）",
      String(item.after?.missing_reason ?? ""),
    );
    if (reason === null) return;
    try {
      await apiFetch(`/api/v1/admin/reviews/${item.id}/modify-accept-and-publish`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({
          changes: { missing_reason: reason || null },
          comment: "管理员修改后接受并发布",
        }),
      });
      setMessage("记录已修改、接受并发布。");
      loadReviews();
    } catch (failure) {
      reportFailure(failure, "修改失败");
    }
  }

  const blocked = Boolean(
    preview
    && ((preview.summary.conflict ?? 0) > 0 || (preview.summary.invalid ?? 0) > 0),
  );
  const visibleRows = useMemo(
    () => preview
      ? filterPreviewRows(preview.rows, sheetFilter, classificationFilter, keyword)
      : [],
    [classificationFilter, keyword, preview, sheetFilter],
  );

  return (
    <div className="stack">
      <div className="notice">Phase 1A 中审核通过会立即公开；未来版本将拆分为审核批准和发布批次两个独立步骤。</div>
      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}

      <section className="panel" id="excel-import">
        <div className="panel-head">
          <div><h2>Excel 导入与差异预览</h2><span className="count">确认前逐行核对业务对象、原始数据和标准化结果</span></div>
          <button className="button secondary" type="button" onClick={downloadTemplate}>下载模板</button>
        </div>
        <div className="form">
          <div className="upload-zone">
            <strong>上传 .xlsx 工作簿</strong>
            <p className="meta">先生成差异预览；确认后观察数据仍不会公开。</p>
            <input type="file" accept=".xlsx" onChange={upload} disabled={busy} />
          </div>

          {preview && (
            <>
              <div className="summary preview-totals">
                {classificationOrder.map((key) => (
                  <span key={key} className={`classification-${key}`}>
                    {classificationNames[key]} {preview.summary[key] ?? 0}
                  </span>
                ))}
              </div>

              <div className="sheet-counts" aria-label="各工作表记录数量">
                {Object.entries(preview.sheet_counts).map(([sheet, count]) => (
                  <button
                    className={sheetFilter === sheet ? "chip active" : "chip"}
                    type="button"
                    key={sheet}
                    onClick={() => setSheetFilter(sheetFilter === sheet ? "" : sheet)}
                  >
                    {sheet} {count}
                  </button>
                ))}
              </div>

              <div className="preview-filters">
                <label>工作表
                  <select className="select" value={sheetFilter} onChange={(event) => setSheetFilter(event.target.value)}>
                    <option value="">全部工作表</option>
                    {Object.keys(preview.sheet_counts).map((sheet) => <option key={sheet}>{sheet}</option>)}
                  </select>
                </label>
                <label>分类
                  <select className="select" value={classificationFilter} onChange={(event) => setClassificationFilter(event.target.value)}>
                    <option value="">全部分类</option>
                    {classificationOrder.map((key) => <option value={key} key={key}>{classificationNames[key]}</option>)}
                  </select>
                </label>
                <label>关键词
                  <input className="input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="项目、公司、ISO3、source_code…" />
                </label>
              </div>

              <div className="preview-result-count">
                显示 {visibleRows.length} / {preview.rows.length} 条
              </div>
              <div className="preview-list">
                {visibleRows.map((row) => <PreviewRecord row={row} key={row.id} />)}
                {!visibleRows.length && <div className="empty">没有符合当前筛选条件的记录。</div>}
              </div>

              <div className={blocked ? "confirm-panel blocked" : "confirm-panel"}>
                <div>
                  <strong>确认操作影响</strong>
                  <span>
                    将新增 {preview.action_summary.new} 条；将更新 {preview.action_summary.update} 条；
                    将产生 {preview.action_summary.pending_review_observations} 条待审核观察记录。
                  </span>
                  <span>确认导入不会直接公开；观察记录仍需“接受并发布”。</span>
                </div>
                <button
                  className="button copper"
                  type="button"
                  onClick={confirmImport}
                  disabled={busy || blocked || preview.status !== "previewed"}
                >
                  {preview.status === "confirmed"
                    ? "已确认导入"
                    : blocked
                      ? "请修复冲突或校验失败"
                      : "确认导入"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="panel" id="recent-imports">
        <div className="panel-head">
          <div><h2>最近导入任务</h2><span className="count">刷新页面后仍可核对状态和确认时间</span></div>
          <button className="button secondary" type="button" onClick={loadImports} disabled={busy}>刷新</button>
        </div>
        <div className="import-history-list">
          {imports.map((item) => (
            <article className="import-history-card" key={item.id}>
              <div className="import-history-head"><div><strong>{item.filename}</strong><div className="meta">任务 ID：{item.id}</div></div><span className="chip">{item.status === "confirmed" ? "已确认" : "待确认"}</span></div>
              <div className="import-time-grid"><span>创建：{new Date(item.created_at).toLocaleString("zh-CN")}</span><span>预览：{new Date(item.previewed_at).toLocaleString("zh-CN")}</span><span>确认：{item.confirmed_at ? new Date(item.confirmed_at).toLocaleString("zh-CN") : "—"}</span></div>
              <div className="summary preview-totals">
                <span>新增 {item.summary.new ?? 0}</span><span>更新 {item.summary.update ?? 0}</span><span>无变化 {item.summary.no_change ?? 0}</span><span>冲突 {item.summary.conflict ?? 0}</span><span>校验失败 {item.summary.invalid ?? 0}</span><span>待审核观察记录 {item.action_summary.pending_review_observations}</span>
              </div>
              {item.status === "confirmed" && <div className="import-result-note">{confirmationSuccessMessage(item.action_summary)}</div>}
              <div className="actions"><Link className="button secondary" href={`/admin/imports/${item.id}`}>查看导入详情</Link></div>
            </article>
          ))}
          {!imports.length && <div className="empty">暂无导入任务。</div>}
        </div>
      </section>

      <section className="panel" id="reviews">
        <div className="panel-head">
          <h2>待审核数据</h2>
          <span className="count">{reviews.filter((item) => item.status === "pending").length} 条待处理</span>
        </div>
        <div className="form">
          {reviews.length
            ? reviews.map((item) => (
              <article className="review-card" key={item.id}>
                <div><strong>{item.observation_type}</strong> <span className="chip">{item.status}</span></div>
                <div className="meta">记录 {item.observation_id}</div>
                <div className="meta">值：{String(item.after?.normalized_value ?? "NULL")} · 缺失原因：{String(item.after?.missing_reason ?? "—")}</div>
                {item.status === "pending" && (
                  <div className="actions">
                    <button className="button copper" type="button" onClick={() => reviewAction(item.id, "accept-and-publish")}>接受并发布</button>
                    <button className="button secondary" type="button" onClick={() => modifyAndPublish(item)}>修改后接受并发布</button>
                    <button className="button danger" type="button" onClick={() => reviewAction(item.id, "reject")}>拒绝</button>
                  </div>
                )}
              </article>
            ))
            : <div className="empty">暂无审核项</div>}
        </div>
      </section>
    </div>
  );
}
