import { useEffect, useState } from "react";

/** `since` verildiği sürece geçen saniyeyi her saniye günceller. */
export function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);

  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}
