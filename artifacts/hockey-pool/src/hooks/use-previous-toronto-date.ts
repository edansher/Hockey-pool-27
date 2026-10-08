import { useEffect, useState } from "react";
import { getPreviousPoolDate } from "@workspace/api-client-react";

export function usePreviousTorontoDate(): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const id = setInterval(bump, 60_000);
    window.addEventListener("focus", bump);
    return () => { clearInterval(id); window.removeEventListener("focus", bump); };
  }, []);
  return getPreviousPoolDate();
}
