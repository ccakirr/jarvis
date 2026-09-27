import {
  AlertTriangle,
  BrainCircuit,
  ChevronRight,
  Crosshair,
  Download,
  FileJson,
  LoaderCircle,
  Package,
  Table2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, type CSSProperties, type ReactNode } from "react";

import {
  COLUMN_KIND_LABELS,
  columnKind,
  confusionMatrix,
  cx,
  datasetLabel,
  describeOperationStep,
  findDataset,
  formatCell,
  formatInteger,
  formatMetric,
  formatNumber,
  lineageOf,
  metricViews,
  modelLabel,
  SAMPLE_DATASET_ID,
  taskLabel,
} from "../lib/format";
import type { DatasetSummary, Loadable, ModelReport, Selection, Session } from "../types";

interface InspectorProps {
  selection: Selection | null;
  session: Session | null;
  names: Record<string, string>;
  datasets: Record<string, Loadable<DatasetSummary>>;
  models: Record<string, Loadable<ModelReport>>;
  open: boolean;
  activating: boolean;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onActivate: (datasetId: string) => void;
  onUpload: () => void;
  ensureDataset: (datasetId: string) => void;
  ensureModel: (modelId: string) => void;
}

export function Inspector(props: InspectorProps) {
  const { selection, open, onClose } = props;

  let content: ReactNode;
  if (!selection) {
    content = <InspectorEmpty onActivate={props.onActivate} onUpload={props.onUpload} activating={props.activating} />;
  } else if (selection.kind === "dataset") {
    content = <DatasetView key={selection.id} datasetId={selection.id} {...props} />;
  } else {
    content = <ModelView key={selection.id} modelId={selection.id} {...props} />;
  }

  return (
    <aside className={cx("inspector panel-scroll", open && "is-open")} aria-label="Detaylar">
      <button type="button" className="icon-btn inspector__close" onClick={onClose} aria-label="Detayları kapat">
        <X size={18} />
      </button>
      {content}
    </aside>
  );
}

function InspectorEmpty({
  onActivate,
  onUpload,
  activating,
}: Pick<InspectorProps, "onActivate" | "onUpload" | "activating">) {
  return (
    <div className="inspector-empty">
      <div className="inspector-empty__icon">
        <Table2 size={22} />
      </div>
      <h2>Henüz veri seti seçilmedi</h2>
      <p>Bir CSV yükle ya da örnek satış verisiyle başla. Seçtiğin veri burada detaylı görünecek.</p>
      <div className="inspector-empty__actions">
        <button type="button" className="btn btn--primary" onClick={() => onActivate(SAMPLE_DATASET_ID)} disabled={activating}>
          {activating ? <LoaderCircle size={15} className="spin" /> : <Table2 size={15} />} Örnek veriyi aç
        </button>
        <button type="button" className="btn" onClick={onUpload}>
          <Upload size={15} /> CSV yükle
        </button>
      </div>
    </div>
  );
}

function LoadState({ entry }: { entry: Loadable<unknown> | undefined }) {
  if (entry?.status === "error") {
    return (
      <div className="inspector-state inspector-state--error">
        <AlertTriangle size={18} />
        <span>{entry.error}</span>
      </div>
    );
  }
  return (
    <div className="inspector-state">
      <LoaderCircle size={18} className="spin" />
      <span>Yükleniyor…</span>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="insp-section">
      <header className="insp-section__header">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

// ---------- Dataset ----------

function DatasetView({
  datasetId,
  session,
  names,
  datasets,
  activating,
  onActivate,
  onSelect,
  ensureDataset,
}: InspectorProps & { datasetId: string }) {
  useEffect(() => ensureDataset(datasetId), [datasetId, ensureDataset]);

  const entry = datasets[datasetId];
  const record = findDataset(session, datasetId);
  const lineage = lineageOf(datasetId, session);
  const isActive = session?.active_dataset_id === datasetId;
  const label = datasetLabel(datasetId, session, names);

  return (
    <div className="insp">
      <header className="insp-header">
        <span className="insp-header__kicker">
          <Table2 size={13} /> Veri seti
        </span>
        <div className="insp-header__row">
          <h2 className="insp-header__title">{label}</h2>
          {isActive ? (
            <span className="badge badge--accent">Aktif</span>
          ) : (
            <button type="button" className="btn btn--small btn--primary" onClick={() => onActivate(datasetId)} disabled={activating}>
              {activating ? <LoaderCircle size={13} className="spin" /> : <Crosshair size={13} />} Aktif yap
            </button>
          )}
        </div>
        <code className="insp-header__id">{datasetId}</code>

        {lineage.length > 1 && (
          <nav className="lineage" aria-label="Veri soy ağacı">
            {lineage.map((id, index) => (
              <span key={id} className="lineage__item">
                {index > 0 && <ChevronRight size={13} aria-hidden="true" />}
                <button
                  type="button"
                  className={cx("lineage__chip", id === datasetId && "is-current")}
                  onClick={() => onSelect({ kind: "dataset", id })}
                  disabled={id === datasetId}
                >
                  {datasetLabel(id, session, names)}
                </button>
              </span>
            ))}
          </nav>
        )}
      </header>

      {entry?.status !== "ready" ? <LoadState entry={entry} /> : <DatasetBody summary={entry.data} operations={record?.operations ?? []} />}
    </div>
  );
}

function DatasetBody({
  summary,
  operations,
}: {
  summary: DatasetSummary;
  operations: NonNullable<Session["datasets"][number]["operations"]>;
}) {
  const missingCells = Object.values(summary.null_value_count).reduce((sum, count) => sum + count, 0);
  const numericColumns = new Set(
    summary.columns.filter((column) => columnKind(summary.data_types[column] ?? "") === "number"),
  );

  return (
    <>
      <div className="stat-grid">
        <Stat label="Satır" value={formatInteger(summary.row_count)} />
        <Stat label="Sütun" value={formatInteger(summary.column_count)} />
        <Stat label="Eksik hücre" value={formatInteger(missingCells)} tone={missingCells ? "warn" : undefined} />
        <Stat label="Kopya satır" value={formatInteger(summary.duplicated_rows)} tone={summary.duplicated_rows ? "warn" : undefined} />
      </div>

      {operations.length > 0 && (
        <Section title="Dönüşüm adımları">
          <ol className="steps">
            {operations.map((op, index) => {
              const step = describeOperationStep(op);
              return (
                <li key={index} className="step">
                  <span className="step__index">{index + 1}</span>
                  <span className="step__body">
                    <span className="step__title">{step.title}</span>
                    <code className="step__detail">{step.detail}</code>
                  </span>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      <Section title="Sütunlar" aside={<span className="count">{summary.column_count}</span>}>
        <ul className="columns">
          {summary.columns.map((column) => {
            const kind = columnKind(summary.data_types[column] ?? "");
            const missing = summary.null_value_count[column] ?? 0;
            const ratio = summary.row_count ? missing / summary.row_count : 0;
            return (
              <li key={column} className="column-row">
                <code className="column-row__name" title={column}>
                  {column}
                </code>
                <span className={cx("type-chip", `type-chip--${kind}`)} title={summary.data_types[column]}>
                  {COLUMN_KIND_LABELS[kind]}
                </span>
                <span className="column-row__missing" title={`${missing} eksik değer`}>
                  <span className="missing-bar">
                    <span style={{ "--ratio": ratio } as CSSProperties} />
                  </span>
                  <span className={cx("column-row__count", missing > 0 && "is-missing")}>{missing}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Önizleme"
        aside={
          <span className="muted-note">
            ilk {summary.preview.length} / {formatInteger(summary.row_count)} satır
          </span>
        }
      >
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th className="data-table__index">#</th>
                {summary.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.preview.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="data-table__index">{rowIndex + 1}</td>
                  {summary.columns.map((column) => {
                    const value = row[column];
                    const isNull = value === null || value === undefined;
                    return (
                      <td key={column} className={cx(numericColumns.has(column) && "is-number", isNull && "is-null")}>
                        {isNull ? "null" : formatCell(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={cx("stat", tone && `stat--${tone}`)}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

// ---------- Model ----------

function ModelView({
  modelId,
  session,
  names,
  models,
  onSelect,
  ensureModel,
}: InspectorProps & { modelId: string }) {
  useEffect(() => ensureModel(modelId), [modelId, ensureModel]);

  const entry = models[modelId];
  if (entry?.status !== "ready") {
    return (
      <div className="insp">
        <header className="insp-header">
          <span className="insp-header__kicker">
            <BrainCircuit size={13} /> Model
          </span>
        </header>
        <LoadState entry={entry} />
      </div>
    );
  }

  const model = entry.data;
  const { report } = model;
  const metrics = metricViews(model);
  const matrix = confusionMatrix(model);
  const total = Math.max(1, report.rows_total);
  const droppedEmptyText = report.rows_dropped_empty_text ?? 0;

  return (
    <div className="insp">
      <header className="insp-header">
        <span className="insp-header__kicker">
          <BrainCircuit size={13} /> Model · {taskLabel(model)}
        </span>
        <h2 className="insp-header__title">{modelLabel(model.model_name)}</h2>
        <code className="insp-header__id">{model.model_id}</code>
        <p className="insp-header__source">
          Kaynak:{" "}
          <button type="button" className="link-btn" onClick={() => onSelect({ kind: "dataset", id: model.dataset_id })}>
            {datasetLabel(model.dataset_id, session, names)}
          </button>
        </p>
      </header>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <div key={metric.key} className={cx("metric", metric.quality && `is-${metric.quality}`)}>
            <span className="metric__label">{metric.label}</span>
            <span className="metric__value" title={formatNumber(metric.value)}>
              {formatMetric(metric.value)}
            </span>
            {metric.gauge !== undefined && (
              <span className="metric__gauge">
                <span style={{ "--ratio": metric.gauge } as CSSProperties} />
              </span>
            )}
            {metric.hint && <span className="metric__hint">{metric.hint}</span>}
          </div>
        ))}
      </div>

      {report.top_terms && report.top_terms.length > 0 && (
        <Section
          title="Belirleyici kelimeler"
          aside={report.vocabulary_size ? <span className="muted-note">{formatInteger(report.vocabulary_size)} terim</span> : undefined}
        >
          <div className="term-groups">
            {report.top_terms.map((group, index) => (
              <div key={String(group.label)} className="term-group" style={{ "--tone": `var(--class-${index % 5})` } as CSSProperties}>
                <span className="term-group__label">
                  <code>{report.target_column}</code> = <strong>{String(group.label)}</strong>
                </span>
                <div className="feature-chips">
                  {group.terms.map((term) => (
                    <code key={term} className="term-chip">
                      {term}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="muted-note term-note">
            Metinler küçük harfe ve Türkçe karaktersiz yazıma normalize edilir (ör. “çalışmıyor” → “calismiyor”).
          </p>
        </Section>
      )}

      {matrix && (
        <Section title="Confusion matrix">
          <ConfusionMatrix labels={matrix.labels} matrix={matrix.matrix} />
        </Section>
      )}

      <Section title="Veri bölünmesi">
        <div className="split-bar" role="img" aria-label={`${report.train_rows} eğitim, ${report.test_rows} test satırı`}>
          <span className="split-bar__train" style={{ "--ratio": report.train_rows / total } as CSSProperties} />
          <span className="split-bar__test" style={{ "--ratio": report.test_rows / total } as CSSProperties} />
          <span
            className="split-bar__dropped"
            style={{ "--ratio": (report.rows_dropped_missing_target + droppedEmptyText) / total } as CSSProperties}
          />
        </div>
        <ul className="split-legend">
          <li>
            <i className="dot dot--train" /> {formatInteger(report.train_rows)} eğitim
          </li>
          <li>
            <i className="dot dot--test" /> {formatInteger(report.test_rows)} test
          </li>
          <li>
            <i className="dot dot--dropped" /> {formatInteger(report.rows_dropped_missing_target)} hedefi eksik
          </li>
          {droppedEmptyText > 0 && (
            <li>
              <i className="dot dot--dropped" /> {formatInteger(droppedEmptyText)} boş metin
            </li>
          )}
        </ul>
        <p className="muted-note">
          test_size {report.test_size} · random_state {report.random_state}
        </p>
      </Section>

      <Section title="Hedef ve özellikler">
        <div className="feature-block">
          <span className="feature-block__label">Hedef</span>
          <code className="feature-chip feature-chip--target">{report.target_column}</code>
        </div>
        <div className="feature-block">
          <span className="feature-block__label">{report.text_column ? "Metin sütunu" : "Özellikler"}</span>
          <div className="feature-chips">
            {report.feature_columns.map((column) => (
              <code key={column} className="feature-chip">
                {column}
              </code>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Artifact'lar">
        <div className="downloads">
          <a className="download-card" href={model.model_download_url} download>
            <Package size={18} />
            <span>
              <strong>Model</strong>
              <small>.joblib · scikit-learn pipeline</small>
            </span>
            <Download size={16} className="download-card__arrow" />
          </a>
          <a className="download-card" href={model.report_download_url} download>
            <FileJson size={18} />
            <span>
              <strong>Rapor</strong>
              <small>.json · metrikler ve ayarlar</small>
            </span>
            <Download size={16} className="download-card__arrow" />
          </a>
        </div>
      </Section>
    </div>
  );
}

function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());

  return (
    <div className="cm">
      <div className="cm__axis cm__axis--x">Tahmin</div>
      <div className="cm__axis cm__axis--y">Gerçek</div>
      <div className="cm__grid" style={{ "--n": labels.length } as CSSProperties}>
        <span />
        {labels.map((label) => (
          <span key={`c-${label}`} className="cm__label" title={label}>
            {label}
          </span>
        ))}
        {matrix.map((row, i) => (
          <div key={`r-${labels[i]}`} className="cm__row">
            <span className="cm__label" title={labels[i]}>
              {labels[i]}
            </span>
            {row.map((value, j) => (
              <span
                key={j}
                className={cx("cm__cell", i === j && "is-diagonal")}
                style={{ "--intensity": value / max } as CSSProperties}
                title={`Gerçek ${labels[i]} → Tahmin ${labels[j]}: ${value}`}
              >
                {value}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
