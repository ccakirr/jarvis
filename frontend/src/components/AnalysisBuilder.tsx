import { AlertTriangle, ArrowDown, ArrowUp, LoaderCircle, Play, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { api, errorMessage } from "../api";
import { useOperationCatalog } from "../hooks/useOperationCatalog";
import { aggregationLabel, columnKind, cx, formatCell, formatInteger, formatNumber } from "../lib/format";
import type { Aggregation, AggregationSpec, DatasetSummary, OperationInfo } from "../types";

const MAX_OPERATIONS = 10;
const MAX_VISIBLE_GROUPS = 100;

interface OperationRow extends AggregationSpec {
  id: number;
}

interface PivotRow {
  group: unknown;
  values: (number | null)[];
}

interface AnalysisResult {
  groupBy: string;
  specs: AggregationSpec[];
  rows: PivotRow[];
}

function pickGroupBy(summary: DatasetSummary, numeric: Set<string>): string {
  const candidates = summary.columns.filter((column) => !numeric.has(column));
  if (!candidates.length) return summary.columns[0];

  const uniqueShare = (column: string) =>
    new Set(summary.preview.map((row) => JSON.stringify(row[column]))).size / Math.max(1, summary.preview.length);
  return candidates.reduce((best, column) => (uniqueShare(column) < uniqueShare(best) ? column : best));
}

function allowed(operation: OperationInfo, column: string, numeric: Set<string>): boolean {
  return !operation.requires_numeric || numeric.has(column);
}

function pivot(analyses: Aggregation[]): PivotRow[] {
  const rows = new Map<string, PivotRow>();
  analyses.forEach((analysis, index) => {
    for (const { group, value } of analysis.results) {
      const key = JSON.stringify(group);
      if (!rows.has(key)) rows.set(key, { group, values: analyses.map(() => null) });
      rows.get(key)!.values[index] = value;
    }
  });
  return [...rows.values()];
}

interface AnalysisBuilderProps {
  datasetId: string;
  summary: DatasetSummary;
  onAsk: (text: string) => void;
}

export function AnalysisBuilder({ datasetId, summary, onAsk }: AnalysisBuilderProps) {
  const catalog = useOperationCatalog();
  const numeric = useMemo(
    () => new Set(summary.columns.filter((column) => columnKind(summary.data_types[column] ?? "") === "number")),
    [summary],
  );
  const [groupBy, setGroupBy] = useState(() => pickGroupBy(summary, numeric));
  const [rows, setRows] = useState<OperationRow[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const nextId = useRef(0);

  const operations = catalog.status === "ready" ? catalog.data.available : [];
  const valueColumns = summary.columns.filter((column) => column !== groupBy);

  const firstAllowed = (column: string) => operations.find((operation) => allowed(operation, column, numeric))?.name ?? "count";

  useEffect(() => {
    if (catalog.status !== "ready" || rows.length) return;
    const column = valueColumns.find((c) => numeric.has(c)) ?? valueColumns[0];
    if (!column) return;
    const defaults = catalog.data.available.filter(
      (operation) => catalog.data.defaults.includes(operation.name) && allowed(operation, column, numeric),
    );
    setRows(
      (defaults.length ? defaults.map((operation) => operation.name) : [firstAllowed(column)]).map((operation) => ({
        id: nextId.current++,
        column,
        operation,
      })),
    );
  }, [catalog.status]);

  const updateRow = (id: number, patch: Partial<AggregationSpec>) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        const operation = operations.find((op) => op.name === next.operation);
        if (operation && !allowed(operation, next.column, numeric)) next.operation = firstAllowed(next.column);
        return next;
      }),
    );
  };

  const allowedOr = (operationName: string, column: string) => {
    const operation = operations.find((op) => op.name === operationName);
    return operation && allowed(operation, column, numeric) ? operationName : firstAllowed(column);
  };

  const changeGroupBy = (column: string) => {
    setGroupBy(column);
    const fallback = summary.columns.find((c) => c !== column) ?? column;
    setRows((current) =>
      current.map((row) =>
        row.column === column ? { ...row, column: fallback, operation: allowedOr(row.operation, fallback) } : row,
      ),
    );
  };

  const addRow = () => {
    const last = rows.at(-1);
    const column = last?.column ?? valueColumns[0];
    const used = new Set(rows.filter((row) => row.column === column).map((row) => row.operation));
    const operation =
      operations.find((op) => allowed(op, column, numeric) && !used.has(op.name))?.name ?? firstAllowed(column);
    setRows((current) => [...current, { id: nextId.current++, column, operation }]);
  };

  const uniqueSpecs = (): AggregationSpec[] => {
    const seen = new Set<string>();
    return rows
      .map(({ column, operation }) => ({ column, operation }))
      .filter((spec) => {
        const key = `${spec.column}\u0000${spec.operation}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const run = async () => {
    const specs = uniqueSpecs();
    setRunning(true);
    setError(null);
    try {
      const response = await api.aggregate(datasetId, groupBy, specs);
      setResult({ groupBy, specs, rows: pivot(response.analyses) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const ask = () => {
    const parts = uniqueSpecs().map((spec) => `${aggregationLabel(spec.operation).toLocaleLowerCase("tr-TR")} (${spec.column})`);
    onAsk(`${groupBy} sütununa göre şu analizi yap ve sonucu yorumla: ${parts.join(", ")}.`);
  };

  if (catalog.status === "loading") {
    return (
      <div className="inspector-state">
        <LoaderCircle size={18} className="spin" />
        <span>İşlem kataloğu yükleniyor…</span>
      </div>
    );
  }

  if (catalog.status === "error") {
    return (
      <div className="inspector-state inspector-state--error">
        <AlertTriangle size={18} />
        <span>{catalog.error}</span>
      </div>
    );
  }

  return (
    <div className="analysis">
      <div className="analysis-field">
        <label className="analysis-field__label" htmlFor={`group-by-${datasetId}`}>
          Grupla
        </label>
        <select id={`group-by-${datasetId}`} className="select" value={groupBy} onChange={(e) => changeGroupBy(e.target.value)}>
          {summary.columns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
      </div>

      <div className="analysis-field">
        <span className="analysis-field__label">İşlemler</span>
        <ul className="analysis-rows">
          {rows.map((row) => (
            <li key={row.id} className="analysis-row">
              <select
                className="select"
                aria-label="Sütun"
                value={row.column}
                onChange={(e) => updateRow(row.id, { column: e.target.value })}
              >
                {valueColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
              <select
                className="select"
                aria-label="İşlem"
                value={row.operation}
                onChange={(e) => updateRow(row.id, { operation: e.target.value })}
              >
                {operations.map((operation) => {
                  const enabled = allowed(operation, row.column, numeric);
                  return (
                    <option key={operation.name} value={operation.name} disabled={!enabled}>
                      {aggregationLabel(operation.name)}
                      {enabled ? "" : " · sayısal sütun ister"}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                className="icon-btn icon-btn--small"
                onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
                disabled={rows.length === 1}
                aria-label="İşlemi kaldır"
                title="İşlemi kaldır"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn--ghost btn--small analysis-add"
          onClick={addRow}
          disabled={rows.length >= MAX_OPERATIONS || !valueColumns.length}
        >
          <Plus size={14} /> İşlem ekle
        </button>
      </div>

      <div className="analysis-actions">
        <button type="button" className="btn btn--primary btn--small" onClick={() => void run()} disabled={running || !rows.length}>
          {running ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />} Çalıştır
        </button>
        <button type="button" className="btn btn--small" onClick={ask} disabled={!rows.length}>
          <Sparkles size={14} /> Jarvis'e yorumlat
        </button>
      </div>

      {error && (
        <div className="inspector-state inspector-state--error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {result && <ResultTable result={result} />}
    </div>
  );
}

function ResultTable({ result }: { result: AnalysisResult }) {
  const [sort, setSort] = useState<{ index: number; descending: boolean } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return result.rows;
    return [...result.rows].sort((a, b) => {
      const [x, y] = [a.values[sort.index], b.values[sort.index]];
      if (x === null) return 1;
      if (y === null) return -1;
      return sort.descending ? y - x : x - y;
    });
  }, [result, sort]);

  const maxima = useMemo(
    () =>
      result.specs.map((_, index) => {
        let max = 0;
        for (const row of result.rows) {
          const value = row.values[index];
          if (value === null) continue;
          if (value < 0) return null;
          if (value > max) max = value;
        }
        return max > 0 ? max : null;
      }),
    [result],
  );

  const toggleSort = (index: number) =>
    setSort((current) => (current?.index === index ? { index, descending: !current.descending } : { index, descending: true }));

  const visible = sorted.slice(0, MAX_VISIBLE_GROUPS);

  return (
    <div className="analysis-result">
      <div className="insp-section__header">
        <h3>Sonuç</h3>
        <span className="muted-note">{formatInteger(result.rows.length)} grup</span>
      </div>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>{result.groupBy}</th>
              {result.specs.map((spec, index) => (
                <th key={`${spec.column}-${spec.operation}`} className="is-number" aria-sort={sort?.index === index ? (sort.descending ? "descending" : "ascending") : "none"}>
                  <button type="button" className="sort-btn" onClick={() => toggleSort(index)}>
                    <span className="sort-btn__label">
                      <span>
                        {aggregationLabel(spec.operation)}
                        {sort?.index === index && (sort.descending ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                      </span>
                      <span className="sort-btn__column">{spec.column}</span>
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={JSON.stringify(row.group)}>
                <td className={cx(row.group === null && "is-null")}>{row.group === null ? "(boş)" : formatCell(row.group)}</td>
                {row.values.map((value, index) => (
                  <td key={index} className={cx("is-number", value === null && "is-null")}>
                    {value === null ? "null" : formatNumber(value)}
                    {value !== null && maxima[index] ? (
                      <span className="cell-bar" style={{ "--ratio": value / maxima[index]! } as CSSProperties} />
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.rows.length > MAX_VISIBLE_GROUPS && (
        <p className="muted-note">
          İlk {MAX_VISIBLE_GROUPS} grup gösteriliyor. Daha az gruplu bir sütun seçmek sonucu okunur kılar.
        </p>
      )}
    </div>
  );
}
