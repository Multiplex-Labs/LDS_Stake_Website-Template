export const DAYS_OF_WEEK = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime12(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const period = h < 12 ? "AM" : "PM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(min).padStart(2, "0")} ${period}`;
}
