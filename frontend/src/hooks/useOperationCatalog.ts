import { useEffect, useState } from "react";

import { api, errorMessage } from "../api";
import type { Loadable, OperationCatalog } from "../types";

let cached: Promise<OperationCatalog> | null = null;

export function useOperationCatalog(): Loadable<OperationCatalog> {
  const [state, setState] = useState<Loadable<OperationCatalog>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    cached ??= api.operationCatalog();
    cached
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((error: unknown) => {
        cached = null;
        if (!cancelled) setState({ status: "error", error: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
