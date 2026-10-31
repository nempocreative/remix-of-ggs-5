import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function displayStaffName(name: string) {
  return name.replace(/\s*\(contoh\)\s*$/i, '').trim();
}
