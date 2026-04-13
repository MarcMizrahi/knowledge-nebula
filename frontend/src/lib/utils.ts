import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const SOURCE_ICONS: Record<string, string> = {
  pdf: "📄",
  text: "📝",
  markdown: "📋",
  docx: "📘",
  url: "🔗",
  note: "✏️",
};

export const SOURCE_COLORS: Record<string, string> = {
  pdf: "bg-red-500/20 text-red-300 border-red-500/30",
  text: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  markdown: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  docx: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  url: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  note: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};
