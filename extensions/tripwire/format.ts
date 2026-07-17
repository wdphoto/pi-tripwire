import type { TrackedListener, TripwireConfig } from "./types.ts";

type MinimalTheme = {
  fg(color: string, text: string): string;
};

export function osc8(url: string, label: string): string {
  return `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`;
}

export function sanitizeFooterLabel(label: string): string {
  const cleaned = label.replace(/[\x00-\x1f\x7f\x1b]/g, "").trim();
  return cleaned || "process";
}

export function truncateLabel(label: string, maxWidth: number): string {
  if (maxWidth <= 0 || label.length <= maxWidth) return label;
  if (maxWidth <= 3) return label.slice(0, maxWidth);
  return `${label.slice(0, maxWidth - 3)}...`;
}

export function formatFooterStatus(
  entries: TrackedListener[],
  theme: MinimalTheme,
  config: Pick<TripwireConfig, "maxFooterItems" | "maxLabelWidth">,
): string | undefined {
  if (entries.length === 0) return undefined;

  const visible = entries.slice(0, config.maxFooterItems);
  const parts = visible.map((entry) => {
    const label = truncateLabel(sanitizeFooterLabel(entry.label), config.maxLabelWidth);
    const text = `${label}:${entry.port}`;
    const colored = theme.fg(entry.origin === "agent" ? "accent" : "dim", text);
    return osc8(entry.url, colored);
  });

  const overflow = entries.length - visible.length;
  if (overflow > 0) parts.push(theme.fg("muted", `+${overflow}`));

  return parts.join(" ");
}
