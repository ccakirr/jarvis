import { RefreshCw, ServerCrash } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError, errorMessage } from "./api";
import { Orb } from "./components/Orb";
import { readJSON, writeJSON } from "./lib/storage";
import { Workspace } from "./Workspace";

const SESSION_KEY = "jarvis.sessionId";

type BootState =
  | { status: "loading" }
  | { status: "ready"; sessionId: string }
  | { status: "error"; message: string };

async function resolveSession(forceNew: boolean): Promise<string> {
  const stored = forceNew ? null : readJSON<string | null>("session", SESSION_KEY, null);
  if (stored) {
    try {
      await api.getSession(stored);
      return stored;
    } catch (error) {
      // Backend yeniden başladıysa bellekteki session gitmiştir
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  const session = await api.createSession();
  writeJSON("session", SESSION_KEY, session.session_id);
  return session.session_id;
}

export default function App() {
  const [boot, setBoot] = useState<BootState>({ status: "loading" });
  const started = useRef(false);

  const start = useCallback(async (forceNew = false) => {
    setBoot({ status: "loading" });
    try {
      setBoot({ status: "ready", sessionId: await resolveSession(forceNew) });
    } catch (error) {
      setBoot({ status: "error", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    // StrictMode effect'i iki kez çalıştırır; iki session açmayalım
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  if (boot.status === "ready") {
    return <Workspace key={boot.sessionId} sessionId={boot.sessionId} onNewSession={() => void start(true)} />;
  }

  return (
    <div className="boot">
      {boot.status === "loading" ? (
        <>
          <Orb size="lg" mode="connecting" />
          <p className="boot__text">Jarvis başlatılıyor…</p>
        </>
      ) : (
        <div className="boot__error">
          <ServerCrash size={30} />
          <h1>Backend'e ulaşılamadı</h1>
          <p>{boot.message}</p>
          <pre>cd backend && uvicorn app.main:app --reload</pre>
          <button type="button" className="btn btn--primary" onClick={() => void start()}>
            <RefreshCw size={15} /> Tekrar dene
          </button>
        </div>
      )}
    </div>
  );
}
