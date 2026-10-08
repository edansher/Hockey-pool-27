import { useEffect, useState } from "react";
import { emptyScoringAlerts, expireScoringAlerts, getPoolDates, updateScoringAlerts, type StandingsSnapshot } from "@workspace/api-client-react";

export function useStandingsScoringAlerts(snapshot?: StandingsSnapshot) {
  const [state, setState] = useState(emptyScoringAlerts);
  useEffect(() => {
    if (!snapshot) return;
    setState(previous => updateScoringAlerts(previous, snapshot, Date.now(), getPoolDates(new Date()).today));
  }, [snapshot]);
  useEffect(() => {
    if (!state.alerts.length) return;
    const timer = window.setTimeout(() => setState(previous => expireScoringAlerts(previous, Date.now())),
      Math.max(1, Math.min(...state.alerts.map(alert => alert.expiresAt)) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state.alerts]);
  return state.alerts;
}