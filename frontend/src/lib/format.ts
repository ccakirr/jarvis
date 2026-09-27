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

const signedPercentFormat = new Intl.NumberFormat("tr-TR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const shortDateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const plainPercentFormat = new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 1 });

export function formatPercent(value: number): string {
  return plainPercentFormat.format(value);
}

export function formatSignedPercent(value: number): string {
  return signedPercentFormat.format(value);
}

export function formatShortDate(iso: string): string {
  return shortDateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
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
  time_series_features: "Zaman serisi özellikleri",
  derive_features: "Özellikler türetildi",
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

const FUTURE_PREFIXES = ["target_", "future_"];

export function isLabelColumn(name: string): boolean {
  return FUTURE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

const INFIX_SYMBOLS: Record<string, string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
  gt: ">",
  ge: "≥",
  lt: "<",
  le: "≤",
  eq: "=",
  ne: "≠",
  and: "ve",
  or: "veya",
};

type ExpressionNode = { column?: unknown; value?: unknown; op?: string; args?: ExpressionNode[]; [key: string]: unknown };

export function formatExpression(node: ExpressionNode, nested = false): string {
  if (node.column !== undefined) return String(node.column);
  if (node.value !== undefined) return typeof node.value === "string" ? `"${node.value}"` : String(node.value);

  const op = String(node.op);
  const args = node.args ?? [];
  const arg = (index: number) => (args[index] ? formatExpression(args[index]) : "?");

  if (op in INFIX_SYMBOLS && args.length === 2) {
    const text = `${formatExpression(args[0], true)} ${INFIX_SYMBOLS[op]} ${formatExpression(args[1], true)}`;
    return nested ? `(${text})` : text;
  }
  switch (op) {
    case "neg":
      return `−${formatExpression(args[0], true)}`;
    case "not":
      return `değil(${arg(0)})`;
    case "where":
      return `eğer(${arg(0)}, ${arg(1)}, ${arg(2)})`;
    case "shift":
    case "diff":
    case "pct_change":
      return `${op}(${arg(0)}, ${String(node.periods)})`;
    case "rolling":
      return `rolling_${String(node.stat)}(${arg(0)}, ${String(node.window)})`;
    case "ewm":
      return `ewm(${arg(0)}, ${String(node.span)})`;
    default:
      return `${op}(${args.map((child) => formatExpression(child)).join(", ")})`;
  }
}

/** derive_features tek işlemde birden çok sütun üretir; her sütun ayrı adım olarak gösterilir */
export function expandOperations(operations: TransformOperation[]): TransformOperation[] {
  return operations.flatMap((op) => {
    const features = op.params?.features;
    if (op.operation !== "derive_features" || !Array.isArray(features)) return [op];
    return features.map((feature) => ({ operation: "derived_feature", params: feature as Record<string, unknown> }));
  });
}

export function describeOperations(operations: TransformOperation[]): string {
  const parts: string[] = [];
  let previous = "";
  let count = 0;

  const flush = () => {
    if (previous) parts.push(count > 1 ? `${previous} ×${count}` : previous);
  };

  for (const op of operations) {
    const features = op.params?.features;
    const label =
      op.operation === "derive_column"
        ? `+ ${outputColumn(op)}`
        : op.operation === "derive_features" && Array.isArray(features)
          ? `${features.length} özellik türetildi`
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
    case "derived_feature": {
      const name = String(params.name);
      return {
        title: isLabelColumn(name) ? `${name} · hedef (gelecek)` : name,
        detail: `= ${formatExpression((params.expression ?? {}) as ExpressionNode)}`,
      };
    }
    case "time_series_features":
      return {
        title: "Zaman serisi özellikleri",
        detail: `${String(params.price_column)} · ufuk ${String(params.horizon)} bar · geçmişe dayalı göstergeler + gelecek etiketi`,
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

// ---------- Analiz işlemleri ----------

const AGGREGATION_LABELS: Record<string, string> = {
  mean: "Ortalama",
  sum: "Toplam",
  count: "Sayım",
  median: "Medyan",
  min: "En küçük",
  max: "En büyük",
  std: "Std. sapma",
  var: "Varyans",
  nunique: "Benzersiz",
};

/** Kataloğa yeni eklenen işlem etiket olmadan da ham adıyla görünür */
export function aggregationLabel(operation: string): string {
  return AGGREGATION_LABELS[operation] ?? operation;
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
  tfidf_logistic_regression: "TF-IDF + Logistic Regression",
};

export function modelLabel(modelName: string): string {
  return MODEL_LABELS[modelName] ?? modelName;
}

export function taskLabel(model: ModelReport): string {
  if (model.report.backtest) return "Yön tahmini + backtest";
  if (model.report.text_column) return "Metin sınıflandırma (NLP)";
  return model.task_type === "classification" ? "Sınıflandırma" : "Regresyon";
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
    const baseline = numericMetric(metrics, "baseline_accuracy");
    if (accuracy !== undefined) {
      views.push({
        key: "accuracy",
        label: "Doğruluk",
        value: accuracy,
        quality: baseline === undefined ? scoreQuality(accuracy) : accuracy > baseline ? "fair" : "poor",
        gauge: accuracy,
        hint: baseline === undefined ? "Doğru tahmin oranı" : `Naif taban ${formatNumber(baseline)}`,
      });
    }
    if (f1 !== undefined) {
      views.push({ key: "f1", label: "F1", value: f1, quality: scoreQuality(f1), gauge: f1, hint: "Ağırlıklı ortalama" });
    }
  }
  return views;
}

export function headlineMetric(report: ModelReport): MetricView | undefined {
  const backtest = report.report.backtest;
  if (backtest) {
    return {
      key: "total_return",
      label: "Net getiri",
      value: backtest.total_return,
      quality: backtest.total_return > 0 ? "good" : "poor",
    };
  }
  return metricViews(report)[0];
}

const percentFormat = new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 0 });

/** Kenar çubuğu için kısa gösterim: "%84", "R² 0,72" */
export function shortMetric(metric: MetricView): string {
  if (metric.key === "total_return") return formatSignedPercent(metric.value);
  return metric.key === "accuracy" ? percentFormat.format(metric.value) : `${metric.label} ${formatNumber(metric.value)}`;
}

export function confusionMatrix(report: ModelReport): { labels: string[]; matrix: number[][] } | null {
  const { labels, confusion_matrix: matrix } = report.report.metrics;
  if (!Array.isArray(labels) || !Array.isArray(matrix)) return null;
  return { labels: labels.map(String), matrix: matrix as number[][] };
}
