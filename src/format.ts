import type { TrackedListener, TripwireConfig } from "./types.js";

type MinimalTheme = {
  fg(color: string, text: string): string;
};

export function osc8(url: string, label: string): string {
  return `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`;
}

export function formatFooterStatus(
  entries: TrackedListener[],
  theme: MinimalTheme,
  config: Pick<TripwireConfig, "maxFooterItems">,
): string | undefined {
  if (entries.length === 0) return undefined;

  const visible = entries.slice(0, config.maxFooterItems);
  const parts = visible.map((entry) => {
    const text = `${entry.label}:${entry.port}`;
    const colored = theme.fg("accent", text);
    return osc8(entry.url, colored);
  });

  const overflow = entries.length - visible.length;
  if (overflow > 0) parts.push(theme.fg("dim", `+${overflow}`));

  return parts.join(" ");
}
