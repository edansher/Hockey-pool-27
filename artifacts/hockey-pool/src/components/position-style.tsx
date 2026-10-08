export type PosKey = "F" | "D" | "G" | null;
export const POS_STYLE = {
  F: { label: "Forward", short: "F", bg: "#fbf1c7", border: "#d9b93f", text: "#6b5400" },
  D: { label: "Defence", short: "D", bg: "#dce9f6", border: "#7ea6cf", text: "#1f4c7a" },
  G: { label: "Goalie", short: "G", bg: "#e8e0f3", border: "#a58bcf", text: "#4b2f7a" },
} as const;
export const posKey = (p?: string | null): PosKey => (
  p && ["F", "C", "L", "R", "LW", "RW"].includes(p) ? "F" : p === "D" || p === "G" ? p : null
);
export const posLabel = (p?: string | null) => { const k = posKey(p); return k ? POS_STYLE[k].label : "Position unconfirmed"; };
export const posBg = (p?: string | null) => { const k = posKey(p); return k ? { backgroundColor: POS_STYLE[k].bg, boxShadow: `inset 4px 0 0 ${POS_STYLE[k].border}` } : undefined; };
export function PosBadge({ position }: { position?: string | null }) {
  const k = posKey(position);
  if (!k) return null;
  const s = POS_STYLE[k];
  return <span data-testid={`pos-badge-${k}`} className="mono mr-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: s.bg, borderColor: s.border, color: s.text }}>{s.label}</span>;
}
export function PosLegend({ showGoalies = true }: { showGoalies?: boolean }) {
  return <div data-testid="position-legend" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#627177]">
    <span className="mono text-[10px] uppercase tracking-[.1em]">Position key</span>
    {(["F", "D", "G"] as const).filter(k => showGoalies || k !== "G").map(k => <span key={k} className="rounded-full border px-2.5 py-0.5 font-semibold" style={{ background: POS_STYLE[k].bg, borderColor: POS_STYLE[k].border, color: POS_STYLE[k].text }}>{POS_STYLE[k].short} · {POS_STYLE[k].label}</span>)}
  </div>;
}
