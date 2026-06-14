import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function apiErrorStatus(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const n = parseInt(err.message, 10);
  return Number.isNaN(n) ? null : n;
}

export function apiErrorBody(err: unknown): string {
  if (!(err instanceof Error)) return "";
  return err.message.replace(/^\d+:\s*/, "");
}

export function meetsPasswordComplexity(pw: string): boolean {
  return (
    pw.length >= 8 &&
    pw.length <= 128 &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^a-zA-Z0-9]/.test(pw)
  );
}

export function extractWardNumber(name: string): string {
  const match = name.match(/(\d+)(th|st|nd|rd)\s+Ward/i);
  return match ? match[1] : name;
}

export function fullName(user: { fname: string; lname: string }): string {
  return `${user.fname} ${user.lname}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("");
}

export function parseCommaList(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function formatMeetingTime(startTime: number, duration = 2): string {
  const startHour = Math.floor(startTime);
  const startMinute = Math.round((startTime - startHour) * 60);
  const endTimeRaw = startTime + duration;
  const endHour = Math.floor(endTimeRaw);
  const endMinute = Math.round((endTimeRaw - endHour) * 60);

  function fmt(hour: number, minute: number): string {
    const period = hour < 12 ? "AM" : "PM";
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h}:${minute.toString().padStart(2, "0")} ${period}`;
  }

  return `${fmt(startHour, startMinute)} – ${fmt(endHour, endMinute)}`;
}
