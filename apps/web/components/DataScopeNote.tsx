import type { ReactNode } from "react";

export function DataScopeNote({ summary, children }: { summary: string; children: ReactNode }) {
  return <details className="data-scope-note">
    <summary>
      <strong>数据口径提示</strong>
      <span className="data-scope-summary">{summary}</span>
      <span className="data-scope-toggle" aria-hidden="true" />
    </summary>
    <div className="data-scope-content">{children}</div>
  </details>;
}
