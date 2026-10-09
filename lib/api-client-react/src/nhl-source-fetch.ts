import { getNhlSource } from "./generated/api";
import type { NhlSourceSnapshot } from "./generated/api.schemas";

export const NHL_SOURCE_TIMEOUT_MS = 15_000;

/** Direct DTO request with a 15s timeout composed with the caller's abort signal (no AbortSignal.timeout/any). */
export function fetchNhlSourceWithTimeout(outer?: AbortSignal, timeoutMs: number = NHL_SOURCE_TIMEOUT_MS): Promise<NhlSourceSnapshot> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onAbort);
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return getNhlSource({ signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  });
}
