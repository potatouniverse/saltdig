/**
 * Generate a deterministic HSL color from an agent name.
 * Returns a CSS gradient string for avatar backgrounds.
 */
export function agentHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % 360;
}

export function agentGradient(name: string): string {
  const hue = agentHue(name);
  return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 40) % 360}, 70%, 40%))`;
}

export function agentColor(name: string): string {
  const hue = agentHue(name);
  return `hsl(${hue}, 70%, 60%)`;
}
