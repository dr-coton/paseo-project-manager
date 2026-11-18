import { useTranslation } from "@getpaseo/plugin/client";
import { messages } from "./messages";

export function useT() {
  return useTranslation(messages).t;
}

export type Translate = ReturnType<typeof useT>;

export function formatAge(t: Translate, ageDays: number | null): string {
  if (ageDays === null) return t("age.none");
  if (ageDays === 0) return t("age.today");
  if (ageDays === 1) return t("age.yesterday");
  if (ageDays < 30) return t("age.days", { count: ageDays });
  if (ageDays < 365) return t("age.months", { count: Math.floor(ageDays / 30) });
  return t("age.years", { count: Math.floor(ageDays / 365) });
}

export function formatDate(t: Translate, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return t("date", { month: date.getMonth() + 1, day: date.getDate() });
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
