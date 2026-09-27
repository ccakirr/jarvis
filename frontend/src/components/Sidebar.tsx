import { BrainCircuit, GitBranch, LoaderCircle, Plus, RotateCcw, Table2, UploadCloud } from "lucide-react";
import type { CSSProperties } from "react";

import {
  buildDatasetTree,
  cx,
  datasetLabel,
  formatInteger,
  headlineMetric,
  modelLabel,
  SAMPLE_DATASET_ID,
  shortId,
  shortMetric,
  type DatasetNode,
} from "../lib/format";
import type { DatasetSummary, Loadable, ModelReport, Selection, Session } from "../types";

interface SidebarProps {
  session: Session | null;
  names: Record<string, string>;
  datasets: Record<string, Loadable<DatasetSummary>>;
  models: Record<string, Loadable<ModelReport>>;
  selection: Selection | null;
  uploading: boolean;
  open: boolean;
  onSelect: (selection: Selection) => void;
  onUpload: () => void;
  onNewSession: () => void;
}

export function Sidebar({
  session,
  names,
  datasets,
  models,
  selection,
  uploading,
  open,
  onSelect,
  onUpload,
  onNewSession,
}: SidebarProps) {
  const tree = buildDatasetTree(session);
  const modelIds = [...(session?.model_ids ?? [])].reverse();

  const datasetMeta = (datasetId: string, isDerived: boolean): string => {
    const summary = datasets[datasetId];
    if (summary?.status === "ready") {
      return `${formatInteger(summary.data.row_count)} satır · ${summary.data.column_count} sütun`;
    }
    if (datasetId === SAMPLE_DATASET_ID) return "Örnek veri";
    return isDerived ? "Türetildi" : "Yüklendi";
  };

  const renderNode = (node: DatasetNode, depth: number) => {
    const id = node.record.dataset_id;
    const isDerived = Boolean(node.record.source_dataset_id);
    const isActive = session?.active_dataset_id === id;
    const isSelected = selection?.kind === "dataset" && selection.id === id;
    const Icon = isDerived ? GitBranch : Table2;

    return (
      <li key={id}>
        <button
          type="button"
          className={cx("tree-item", isSelected && "is-selected", isActive && "is-active")}
          style={{ "--depth": depth } as CSSProperties}
          onClick={() => onSelect({ kind: "dataset", id })}
        >
          <span className="tree-item__icon">
            <Icon size={15} />
          </span>
          <span className="tree-item__body">
            <span className="tree-item__title">{datasetLabel(id, session, names)}</span>
            <span className="tree-item__meta">{datasetMeta(id, isDerived)}</span>
          </span>
          {isActive && <span className="badge badge--accent">Aktif</span>}
        </button>
        {node.children.length > 0 && <ul className="tree">{node.children.map((child) => renderNode(child, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <aside className={cx("sidebar panel-scroll", open && "is-open")} aria-label="Çalışma alanı">
      <section className="side-section">
        <header className="side-section__header">
          <h2>Veri setleri</h2>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            onClick={onUpload}
            disabled={uploading}
            aria-label="CSV yükle"
            title="CSV yükle"
          >
            {uploading ? <LoaderCircle size={15} className="spin" /> : <Plus size={16} />}
          </button>
        </header>

        <ul className="tree">{tree.map((node) => renderNode(node, 0))}</ul>

        <button type="button" className="dropzone-hint" onClick={onUpload} disabled={uploading}>
          <UploadCloud size={16} />
          <span>{uploading ? "Yükleniyor…" : "CSV sürükle-bırak ya da tıkla"}</span>
        </button>
      </section>

      <section className="side-section">
        <header className="side-section__header">
          <h2>Modeller</h2>
          {modelIds.length > 0 && <span className="count">{modelIds.length}</span>}
        </header>

        {modelIds.length === 0 ? (
          <p className="side-empty">
            Henüz model yok. <em>“units_sold için bir model eğit”</em> demeyi dene.
          </p>
        ) : (
          <ul className="model-list">
            {modelIds.map((modelId) => {
              const entry = models[modelId];
              const report = entry?.status === "ready" ? entry.data : null;
              const metric = report ? headlineMetric(report) : undefined;
              const isSelected = selection?.kind === "model" && selection.id === modelId;

              return (
                <li key={modelId}>
                  <button
                    type="button"
                    className={cx("model-item", isSelected && "is-selected")}
                    onClick={() => onSelect({ kind: "model", id: modelId })}
                  >
                    <span className="model-item__icon">
                      <BrainCircuit size={15} />
                    </span>
                    <span className="tree-item__body">
                      <span className="tree-item__title">{report ? modelLabel(report.model_name) : "Model yükleniyor…"}</span>
                      <span className="tree-item__meta">
                        {report ? `hedef: ${report.report.target_column}` : shortId(modelId)}
                      </span>
                    </span>
                    {metric && (
                      <span className={cx("metric-pill", metric.quality && `is-${metric.quality}`)} title={metric.label}>
                        {shortMetric(metric)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="side-footer">
        <span className="side-footer__session" title={session?.session_id}>
          Oturum <code>{session ? shortId(session.session_id) : "…"}</code>
        </span>
        <button type="button" className="btn btn--ghost btn--small" onClick={onNewSession}>
          <RotateCcw size={13} /> Yeni oturum
        </button>
      </footer>
    </aside>
  );
}
