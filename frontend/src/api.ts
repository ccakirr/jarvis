import type {
  Aggregation,
  AggregationSpec,
  DatasetSummary,
  ModelReport,
  OperationCatalog,
  Session,
  UploadResult,
  VoiceToken,
} from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, "Backend'e ulaşılamadı. Sunucu çalışıyor mu?");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response));
  }

  return (await response.json()) as T;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (body.detail) return JSON.stringify(body.detail);
  } catch {
    // FastAPI dışı hata sayfası (ör. 500) JSON değil
  }
  return response.status >= 500
    ? `Sunucu hatası (${response.status}). Backend loglarına bak.`
    : `İstek başarısız (${response.status}).`;
}

function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  createSession: () => request<Session>("/sessions", { method: "POST" }),

  getSession: (sessionId: string) => request<Session>(`/sessions/${sessionId}`),

  setActiveDataset: (sessionId: string, datasetId: string) =>
    request<Session>(
      `/sessions/${sessionId}/dataset`,
      jsonBody("PUT", { dataset_id: datasetId }),
    ),

  sendMessage: (sessionId: string, message: string) =>
    request<{ session_id: string; answer: unknown }>(
      `/sessions/${sessionId}/messages`,
      jsonBody("POST", { message, mode: "text" }),
    ),

  uploadDataset: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<UploadResult>("/datasets", { method: "POST", body: form });
  },

  getDataset: (datasetId: string) =>
    request<{ dataset_id: string; summary: DatasetSummary }>(`/datasets/${datasetId}`),

  getModel: (modelId: string) => request<ModelReport>(`/models/${modelId}`),

  operationCatalog: () => request<OperationCatalog>("/analysis/operations"),

  aggregate: (datasetId: string, groupBy: string, operations: AggregationSpec[]) =>
    request<{ dataset_id: string; analyses: Aggregation[] }>(
      "/analysis/aggregate",
      jsonBody("POST", { dataset_id: datasetId, group_by: groupBy, operations }),
    ),

  voiceToken: (sessionId: string) =>
    request<VoiceToken>(`/sessions/${sessionId}/voice-token`, { method: "POST" }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Beklenmeyen bir hata oluştu.";
}
