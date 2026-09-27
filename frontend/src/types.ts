export interface TransformOperation {
  operation: string;
  params?: Record<string, unknown>;
}

export interface SessionDataset {
  dataset_id: string;
  source_dataset_id: string | null;
  operations: TransformOperation[];
}

export interface Session {
  session_id: string;
  active_dataset_id: string | null;
  datasets: SessionDataset[];
  model_ids: string[];
}

export interface DatasetSummary {
  row_count: number;
  column_count: number;
  columns: string[];
  data_types: Record<string, string>;
  null_value_count: Record<string, number>;
  duplicated_rows: number;
  preview: Record<string, unknown>[];
}

export interface EquityPoint {
  time: string;
  strategy: number;
  buy_hold: number;
}

export interface Backtest {
  strategy: "long_short" | "long_only";
  cost_bps: number;
  horizon: number;
  periods: number;
  trades: number;
  exposure: number;
  hit_rate: number;
  total_return: number;
  gross_return: number;
  buy_hold_return: number;
  sharpe: number;
  max_drawdown: number;
  equity_curve: EquityPoint[];
}

export interface ModelReport {
  model_id: string;
  dataset_id: string;
  model_name: string;
  task_type: "classification" | "regression";
  report: {
    // Classification: accuracy, f1, labels, confusion_matrix — Regression: mse, r2
    metrics: Record<string, unknown>;
    rows_total: number;
    rows_dropped_missing_target: number;
    train_rows: number;
    test_rows: number;
    target_column: string;
    feature_columns: string[];
    test_size: number;
    random_state?: number;
    // Yalnızca zaman serisi (train_direction_model) modellerinde
    split?: "chronological";
    horizon?: number;
    purged_rows?: number;
    return_column?: string;
    train_period?: { start: string; end: string };
    test_period?: { start: string; end: string };
    backtest?: Backtest;
    // Yalnızca NLP (train_text_classifier) modellerinde
    text_column?: string;
    rows_dropped_empty_text?: number;
    vocabulary_size?: number;
    class_distribution?: { label: unknown; count: number }[];
    top_terms?: { label: unknown; terms: string[] }[];
  };
  model_download_url: string;
  report_download_url: string;
}

export interface UploadResult {
  original_filename: string;
  size: number;
  dataset_id: string;
  summary: DatasetSummary;
}

export interface VoiceToken {
  server_url: string;
  room_name: string;
  participant_token: string;
}

export interface OperationInfo {
  name: string;
  default: boolean;
  requires_numeric: boolean;
}

export interface OperationCatalog {
  defaults: string[];
  available: OperationInfo[];
}

export interface AggregationSpec {
  column: string;
  operation: string;
}

export interface Aggregation extends AggregationSpec {
  group_by: string;
  results: { group: unknown; value: number | null }[];
}

export type Loadable<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: string };

export type Selection =
  | { kind: "dataset"; id: string }
  | { kind: "model"; id: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "event";
  text: string;
  channel: "text" | "voice";
  createdAt: number;
  status?: "pending" | "error";
}

/** voice worker'ın jarvis.chat kanalına gönderdiği sohbet kaydı */
export interface VoiceSegment {
  id: string;
  role: "user" | "assistant" | "notice" | "error";
  text: string;
}

export type VoiceMode = "idle" | "connecting" | "listening" | "busy" | "speaking";
