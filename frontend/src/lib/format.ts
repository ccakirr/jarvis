import type { ModelReport, Session, SessionDataset, TransformOperation } from "../types";

export const SAMPLE_DATASET_ID = "sample";

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export function shortId(id: string): string {
  return id.slice(0, 6);
}

// ---------- Sayılar ----------

const numberFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 });
const compactFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) >= 1000 ? compactFormat.format(value) : numberFormat.format(value);
}

const metricCompactFormat = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

/** Metrik kutuları dar; büyük değerler "14,3 B" gibi kısaltılır */
export function formatMetric(value: number): string {
  return Math.abs(value) >= 10_000 ? metricCompactFormat.format(value) : formatNumber(value);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("tr-TR").format(value);
}

export function formatCell(value: unknown): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

// ---------- Dataset etiketleri ve soy ağacı ----------

const OPERATION_LABELS: Record<string, string> = {
  fill_missing_values: "Eksikler dolduruldu",
  drop_duplicates: "Tekrarlar silindi",
  drop_empty_rows: "Boş satırlar silindi",
  filter_rows: "Filtrelendi",
  select_columns: "Sütunlar seçildi",
};

const OPERATOR_SYMBOLS: Record<string, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  eq: "=",
  ne: "≠",
  lt: "<",
  le: "≤",
  gt: ">",
  ge: "≥",
};

function outputColumn(op: TransformOperation): string {
  const value = op.params?.output_column;
  return typeof value === "string" ? value : "sütun";
}

export function describeOperations(operations: TransformOperation[]): string {
  const parts: string[] = [];
  let previous = "";
  let count = 0;

  const flush = () => {
    if (previous) parts.push(count > 1 ? `${previous} ×${count}` : previous);
  };

  for (const op of operations) {
    const label =
      op.operation === "derive_column"
        ? `+ ${outputColumn(op)}`
        : (OPERATION_LABELS[op.operation] ?? op.operation);
    if (label === previous) {
      count += 1;
    } else {
      flush();
      previous = label;
      count = 1;
    }
  }
  flush();

  return parts.join(" · ") || "Dönüştürülmüş veri";
}

function describeOperand(operand: unknown): string {
  if (operand && typeof operand === "object") {
    const record = operand as Record<string, unknown>;
    if ("column" in record) return String(record.column);
    if ("value" in record) return formatCell(record.value);
  }
  return "?";
}

export function describeOperationStep(op: TransformOperation): { title: string; detail: string } {
  const params = op.params ?? {};
  switch (op.operation) {
    case "fill_missing_values":
      return {
        title: "Eksik değer doldurma",
        detail: `${String(params.column)} → ${JSON.stringify(params.value)}`,
      };
    case "derive_column": {
      const expression = (params.expression ?? {}) as Record<string, unknown>;
      const symbol = OPERATOR_SYMBOLS[String(expression.operator)] ?? "?";
      return {
        title: "Yeni sütun",
        detail: `${outputColumn(op)} = ${describeOperand(expression.left)} ${symbol} ${describeOperand(expression.right)}`,
      };
    }
    case "filter_rows":
      return {
        title: "Satır filtreleme",
        detail: `${String(params.column)} ${OPERATOR_SYMBOLS[String(params.operator)] ?? String(params.operator)} ${JSON.stringify(params.value)}`,
      };
    case "select_columns":
      return {
        title: "Sütun seçimi",
        detail: Array.isArray(params.columns) ? params.columns.join(", ") : JSON.stringify(params.columns),
      };
    case "drop_duplicates":
      return { title: "Tekrarlı satırları silme", detail: "Birebir aynı satırlar kaldırıldı" };
    case "drop_empty_rows":
      return { title: "Boş satırları silme", detail: "Tamamen boş satırlar kaldırıldı" };
    default:
      return { title: op.operation, detail: JSON.stringify(params) };
  }
}

export function findDataset(session: Session | null, datasetId: string): SessionDataset | undefined {
  return session?.datasets.find((item) => item.dataset_id === datasetId);
}

export function datasetLabel(
  datasetId: string,
  session: Session | null,
  names: Record<string, string>,
): string {
  if (datasetId === SAMPLE_DATASET_ID) return "sample.csv";
  if (names[datasetId]) return names[datasetId];

  const record = findDataset(session, datasetId);
  if (record?.source_dataset_id) return describeOperations(record.operations);

  return `Veri seti ${shortId(datasetId)}`;
}

/** Kökten verilen dataset'e kadar olan zincir (kök ilk sırada). */
export function lineageOf(datasetId: string, session: Session | null): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | null = datasetId;

  while (current && !seen.has(current)) {
    seen.add(current);
    chain.unshift(current);
    current = findDataset(session, current)?.source_dataset_id ?? null;
  }
  return chain;
}

export interface DatasetNode {
  record: SessionDataset;
  children: DatasetNode[];
}

export function buildDatasetTree(session: Session | null): DatasetNode[] {
  const records = [...(session?.datasets ?? [])];
  if (!records.some((record) => record.dataset_id === SAMPLE_DATASET_ID)) {
    records.unshift({ dataset_id: SAMPLE_DATASET_ID, source_dataset_id: null, operations: [] });
  }

  const nodes = new Map<string, DatasetNode>(
    records.map((record) => [record.dataset_id, { record, children: [] }]),
  );
  const roots: DatasetNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.record.source_dataset_id
      ? nodes.get(node.record.source_dataset_id)
      : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

// ---------- Sütun tipleri ----------

export type ColumnKind = "number" | "text" | "bool" | "date";

export function columnKind(dtype: string): ColumnKind {
  if (/int|float|double|decimal/i.test(dtype)) return "number";
  if (/bool/i.test(dtype)) return "bool";
  if (/date|time/i.test(dtype)) return "date";
  return "text";
}

export const COLUMN_KIND_LABELS: Record<ColumnKind, string> = {
  number: "sayı",
  text: "metin",
  bool: "mantıksal",
  date: "tarih",
};

// ---------- Modeller ----------

const MODEL_LABELS: Record<string, string> = {
  logistic_regression: "Logistic Regression",
  random_forest: "Random Forest",
  extra_trees: "Extra Trees",
  decision_tree: "Decision Tree",
  hist_gradient_boosting: "Histogram Gradient Boosting",
  ridge: "Ridge Regression",
};

export function modelLabel(modelName: string): string {
  return MODEL_LABELS[modelName] ?? modelName;
}

export function taskLabel(taskType: ModelReport["task_type"]): string {
  return taskType === "classification" ? "Sınıflandırma" : "Regresyon";
}

export type Quality = "good" | "fair" | "poor";

export interface MetricView {
  key: string;
  label: string;
  value: number;
  hint?: string;
  quality?: Quality;
  /** 0–1 arası gösterge; yoksa çubuk çizilmez */
  gauge?: number;
}

function scoreQuality(value: number): Quality {
  if (value >= 0.7) return "good";
  if (value >= 0.3) return "fair";
  return "poor";
}

function numericMetric(metrics: Record<string, unknown>, key: string): number | undefined {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function metricViews(report: ModelReport): MetricView[] {
  const metrics = report.report.metrics;
  const views: MetricView[] = [];

  if (report.task_type === "regression") {
    const r2 = numericMetric(metrics, "r2");
    const mse = numericMetric(metrics, "mse");
    if (r2 !== undefined) {
      views.push({
        key: "r2",
        label: "R²",
        value: r2,
        quality: scoreQuality(r2),
        gauge: Math.max(0, Math.min(1, r2)),
        hint: r2 < 0 ? "Ortalama tahminden kötü" : "Açıklanan varyans",
      });
    }
    if (mse !== undefined) {
      views.push({ key: "rmse", label: "RMSE", value: Math.sqrt(mse), hint: "Tipik hata (hedef biriminde)" });
      views.push({ key: "mse", label: "MSE", value: mse, hint: "Ortalama kare hata" });
    }
  } else {
    const accuracy = numericMetric(metrics, "accuracy");
    const f1 = numericMetric(metrics, "f1");
    if (accuracy !== undefined) {
      views.push({
        key: "accuracy",
        label: "Doğruluk",
        value: accuracy,
        quality: scoreQuality(accuracy),
        gauge: accuracy,
        hint: "Doğru tahmin oranı",
      });
    }
    if (f1 !== undefined) {
      views.push({ key: "f1", label: "F1", value: f1, quality: scoreQuality(f1), gauge: f1, hint: "Ağırlıklı ortalama" });
    }
  }
  return views;
}

export function headlineMetric(report: ModelReport): MetricView | undefined {
  return metricViews(report)[0];
}

const percentFormat = new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 0 });

/** Kenar çubuğu için kısa gösterim: "%84", "R² 0,72" */
export function shortMetric(metric: MetricView): string {
  return metric.key === "accuracy" ? percentFormat.format(metric.value) : `${metric.label} ${formatNumber(metric.value)}`;
}

export function confusionMatrix(report: ModelReport): { labels: string[]; matrix: number[][] } | null {
  const { labels, confusion_matrix: matrix } = report.report.metrics;
  if (!Array.isArray(labels) || !Array.isArray(matrix)) return null;
  return { labels: labels.map(String), matrix: matrix as number[][] };
}
