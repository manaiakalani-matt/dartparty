interface Segment {
  label: string;
  value: number;
  finish: boolean;
  preference: number;
}

const segments: Segment[] = [];

for (let value = 20; value >= 1; value -= 1) {
  segments.push({ label: `T${value}`, value: value * 3, finish: false, preference: 100 + value });
}

for (let value = 20; value >= 1; value -= 1) {
  segments.push({ label: `${value}`, value, finish: false, preference: 60 + value });
}

segments.push({ label: "25", value: 25, finish: false, preference: 75 });

for (let value = 20; value >= 1; value -= 1) {
  segments.push({ label: `D${value}`, value: value * 2, finish: true, preference: 40 + value });
}

segments.push({ label: "Bull", value: 50, finish: true, preference: 65 });

const finishes = segments.filter((segment) => segment.finish);
const setupSegments = segments.filter((segment) => !segment.finish);

const routePreference = (route: Segment[]) =>
  route.reduce((total, segment, index) => total + segment.preference * (route.length - index), 0);

export function checkoutRoute(score: number): string[] | null {
  if (!Number.isInteger(score) || score < 2 || score > 170) return null;

  const candidates: Segment[][] = [];

  for (const finish of finishes) {
    if (finish.value === score) candidates.push([finish]);
  }

  for (const setup of setupSegments) {
    for (const finish of finishes) {
      if (setup.value + finish.value === score) candidates.push([setup, finish]);
    }
  }

  for (const first of setupSegments) {
    for (const second of setupSegments) {
      for (const finish of finishes) {
        if (first.value + second.value + finish.value === score) {
          candidates.push([first, second, finish]);
        }
      }
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return routePreference(b) - routePreference(a);
  });

  return candidates[0].map((segment) => segment.label);
}
