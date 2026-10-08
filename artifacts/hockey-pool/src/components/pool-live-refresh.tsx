import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startPoolLiveRefresh } from "@workspace/api-client-react";

export function PoolLiveRefresh() {
  const client = useQueryClient();
  useEffect(() => {
    const refresh = startPoolLiveRefresh(client, {
      isForeground: () => document.visibilityState !== "hidden" && navigator.onLine,
    });
    const resume = () => { void refresh.refresh(); };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      refresh.stop();
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [client]);
  return null;
}