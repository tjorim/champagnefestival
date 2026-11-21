export interface ClockSample {
  sent: number;
  received: number;
  server: number;
}

export function estimateOffset(samples: ClockSample[]): number {
  const best = samples.reduce((a, b) => (b.received - b.sent < a.received - a.sent ? b : a));
  return best.server - (best.sent + best.received) / 2;
}

export function slideAtTime(durations: number[], epoch: number, now: number) {
  const cycle = durations.reduce((sum, duration) => sum + duration * 1000, 0);
  if (!cycle) return { index: -1, remaining: 1000, boundary: now + 1000 };
  let position = (((now - epoch) % cycle) + cycle) % cycle;
  const boundary = now + cycle - position;
  for (let index = 0; index < durations.length; index++) {
    const duration = durations[index]! * 1000;
    if (position < duration) return { index, remaining: duration - position, boundary };
    position -= duration;
  }
  return { index: -1, remaining: 1000, boundary };
}
