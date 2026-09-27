import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "../api";
import { readJSON, writeJSON } from "../lib/storage";
import type { DatasetSummary, Loadable, ModelReport, Session } from "../types";

const NAMES_KEY = "jarvis.datasetNames";

/**
 * Backend session'ı ve ona bağlı dataset/model detayları.
 * Dataset ve model kayıtları değişmez (dönüşüm yeni ID üretir),
 * bu yüzden bir kez çekilip önbellekte tutulur.
 */
export function useWorkspaceData(sessionId: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [datasets, setDatasets] = useState<Record<string, Loadable<DatasetSummary>>>({});
  const [models, setModels] = useState<Record<string, Loadable<ModelReport>>>({});
  // Backend yüklenen dosyanın adını saklamıyor; adları tarayıcı hatırlıyor
  const [names, setNames] = useState<Record<string, string>>(() => readJSON("local", NAMES_KEY, {}));
  const requested = useRef(new Set<string>());

  useEffect(() => {
    writeJSON("local", NAMES_KEY, names);
  }, [names]);

  const refresh = useCallback(async () => {
    try {
      setSession(await api.getSession(sessionId));
    } catch {
      // Geçici hata: son bilinen durumu göstermeye devam et
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ensureDataset = useCallback((datasetId: string) => {
    const key = `dataset:${datasetId}`;
    if (requested.current.has(key)) return;
    requested.current.add(key);

    setDatasets((prev) => ({ ...prev, [datasetId]: { status: "loading" } }));
    api
      .getDataset(datasetId)
      .then((result) =>
        setDatasets((prev) => ({ ...prev, [datasetId]: { status: "ready", data: result.summary } })),
      )
      .catch((error: unknown) => {
        requested.current.delete(key);
        setDatasets((prev) => ({ ...prev, [datasetId]: { status: "error", error: errorMessage(error) } }));
      });
  }, []);

  const ensureModel = useCallback((modelId: string) => {
    const key = `model:${modelId}`;
    if (requested.current.has(key)) return;
    requested.current.add(key);

    setModels((prev) => ({ ...prev, [modelId]: { status: "loading" } }));
    api
      .getModel(modelId)
      .then((report) => setModels((prev) => ({ ...prev, [modelId]: { status: "ready", data: report } })))
      .catch((error: unknown) => {
        requested.current.delete(key);
        setModels((prev) => ({ ...prev, [modelId]: { status: "error", error: errorMessage(error) } }));
      });
  }, []);

  // Kenar çubuğu satır/sütun sayılarını ve model metriklerini gösterebilsin
  useEffect(() => {
    session?.datasets.forEach((item) => ensureDataset(item.dataset_id));
    session?.model_ids.forEach(ensureModel);
  }, [session, ensureDataset, ensureModel]);

  const activate = useCallback(
    async (datasetId: string) => {
      setSession(await api.setActiveDataset(sessionId, datasetId));
    },
    [sessionId],
  );

  const upload = useCallback(
    async (file: File) => {
      const result = await api.uploadDataset(file);
      setNames((prev) => ({ ...prev, [result.dataset_id]: file.name }));
      setSession(await api.setActiveDataset(sessionId, result.dataset_id));
      return result;
    },
    [sessionId],
  );

  return { session, datasets, models, names, refresh, ensureDataset, ensureModel, activate, upload };
}

export type WorkspaceData = ReturnType<typeof useWorkspaceData>;
