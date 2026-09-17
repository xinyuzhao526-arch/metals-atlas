"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminSession } from "@/components/AdminLayout";
import { apiFetch } from "@/lib/api";
import { businessSummary, classificationNames, confirmationSuccessMessage, Preview } from "@/lib/admin-preview";


const resultNames: Record<string, string> = {
  applied: "已写入",
  skipped: "无变化，已跳过",
  failed: "未写入",
  not_confirmed: "尚未确认",
};


export function AdminImportDetail({ jobId }: { jobId: string }) {
  const { handleAdminFailure } = useAdminSession();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<Preview>(`/api/v1/admin/imports/${jobId}/preview`)
      .then(setPreview)
      .catch((reason) => {
        if (!handleAdminFailure(reason)) setError(reason instanceof Error ? reason.message : "导入详情加载失败");
      });
  }, [handleAdminFailure, jobId]);
  if (error) return <main className="page"><Link className="back" href="/admin#recent-imports">← 返回最近导入</Link><div className="empty error">{error}</div></main>;
  if (!preview) return <main className="page"><div className="empty">正在读取导入详情…</div></main>;
  const action = preview.action_summary;
  return <main className="page">
    <Link className="back" href="/admin#recent-imports">← 返回最近导入</Link>
    <section className="detail-header"><div><div className="eyebrow">IMPORT JOB</div><h1>{preview.filename}</h1><p className="lede">任务 {preview.id}</p></div><div className="ownership"><strong>{preview.status === "confirmed" ? "已确认" : "待确认"}</strong><span>{preview.confirmed_at ? `确认于 ${new Date(preview.confirmed_at).toLocaleString("zh-CN")}` : "尚未确认"}</span></div></section>
    {preview.status === "confirmed" && action.by_sheet && <div className="notice"><strong>{confirmationSuccessMessage(action)}</strong></div>}
    <section className="section panel">
      <div className="panel-head"><h2>工作表与分类统计</h2><span className="count">预览 {preview.previewed_at ? new Date(preview.previewed_at).toLocaleString("zh-CN") : "—"}</span></div>
      <div className="form"><div className="summary preview-totals">{Object.entries(preview.summary).map(([key, value]) => <span key={key}>{classificationNames[key] ?? key} {value}</span>)}</div><div className="sheet-counts">{Object.entries(preview.sheet_counts).map(([sheet, count]) => <span className="chip" key={sheet}>{sheet} {count}</span>)}</div></div>
    </section>
    <section className="section panel">
      <div className="panel-head"><div><h2>每行确认结果</h2><span className="count">实际创建或更新的实体及失败/跳过原因</span></div>{preview.status === "confirmed" ? <button className="button" disabled>已确认，不可重复确认</button> : <Link className="button secondary" href="/admin#excel-import">返回 Excel 导入页</Link>}</div>
      <div className="preview-list import-detail-list">{preview.rows.map((row) => {
        const summary = businessSummary(row);
        const reasons = row.errors.length ? row.errors.join("；") : row.confirmation_result === "skipped" ? "数据与数据库一致" : "—";
        return <details className="preview-record" key={row.id}>
          <summary className="preview-record-summary"><span className="preview-location"><strong>{row.sheet}</strong><span>第 {row.row_number} 行</span></span><span className={`classification classification-${row.classification}`}>{classificationNames[row.classification] ?? row.classification}</span><span className="preview-business"><strong>{summary.title}</strong><span>{summary.fields.map((field) => `${field.label}：${field.value}`).join(" · ")}</span></span><span className="preview-issues">{resultNames[row.confirmation_result] ?? row.confirmation_result}</span></summary>
          <div className="preview-record-details">
            <div className="import-entity-line"><strong>确认结果：</strong>{resultNames[row.confirmation_result] ?? row.confirmation_result}<span className="meta">实体 ID：{row.applied_record_id ?? row.entity?.id ?? "—"}</span>{row.entity?.project && <Link className="source-link" href={row.entity.project.admin_path}>查看项目：{row.entity.project.name} →</Link>}</div>
            <div><strong>失败或跳过原因：</strong>{reasons}</div>
            <div className="json-grid"><section><h3>原始 JSON</h3><pre>{JSON.stringify(row.raw, null, 2)}</pre></section><section><h3>标准化 JSON</h3><pre>{JSON.stringify(row.normalized, null, 2)}</pre></section></div>
          </div>
        </details>;
      })}</div>
    </section>
  </main>;
}
