import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
