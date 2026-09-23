import type { ActivityLog } from "@/lib/domain";
import type { DayFeatures } from "@/lib/game/features";

export type RuleExpr =
  | { all: RuleExpr[] }
  | { any: RuleExpr[] }
  | { not: RuleExpr }
  | { cat: string }
  | { type: string }
  | { tag: string }
  | { durationMin: { gte?: number; lte?: number } }
  | { field: string; op: "eq" | "neq" | "contains" | "gte" | "lte" | "in"; value: string | number | string[] }
  | { dayHas: string }
  | { after: { category: string; beforeCategory?: string } }
  | { streakDays: { within: number; atLeast: number; category: string } };

export type RuleContext = { log: ActivityLog; logs: ActivityLog[]; features: DayFeatures; tags?: string[]; recentDayCategories?: string[][] };

function valueAt(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, root);
}

export function evaluateRule(expression: RuleExpr, context: RuleContext): boolean {
  if ("all" in expression) return expression.all.every((rule) => evaluateRule(rule, context));
  if ("any" in expression) return expression.any.some((rule) => evaluateRule(rule, context));
  if ("not" in expression) return !evaluateRule(expression.not, context);
  if ("cat" in expression) return context.log.categoryKey === expression.cat;
  if ("type" in expression) return context.log.typeKey === expression.type;
  if ("tag" in expression) return context.tags?.includes(expression.tag) ?? false;
  if ("durationMin" in expression) {
    return (expression.durationMin.gte === undefined || context.log.durationMin >= expression.durationMin.gte)
      && (expression.durationMin.lte === undefined || context.log.durationMin <= expression.durationMin.lte);
  }
  if ("dayHas" in expression) return context.logs.some((log) => !log.deletedAt && log.categoryKey === expression.dayHas);
  if ("after" in expression) {
    const currentStart = new Date(context.log.startedAt).getTime();
    return context.logs.some((log) => !log.deletedAt && log.categoryKey === expression.after.category && new Date(log.endedAt ?? log.startedAt).getTime() <= currentStart)
      && (!expression.after.beforeCategory || context.logs.some((log) => log.categoryKey === expression.after.beforeCategory && new Date(log.endedAt ?? log.startedAt).getTime() <= currentStart));
  }
  if ("streakDays" in expression) {
    const recent = (context.recentDayCategories ?? []).slice(-expression.streakDays.within);
    return recent.filter((categories) => categories.includes(expression.streakDays.category)).length >= expression.streakDays.atLeast;
  }
  const source = expression.field.startsWith("features.") ? context.features : { ...context.log, details: context.log.details };
  const actual = valueAt(source, expression.field.startsWith("features.") ? expression.field.slice("features.".length) : expression.field);
  switch (expression.op) {
    case "eq": return actual === expression.value;
    case "neq": return actual !== expression.value;
    case "contains": return typeof actual === "string" ? actual.includes(String(expression.value)) : Array.isArray(actual) && actual.includes(expression.value);
    case "gte": return typeof actual === "number" && typeof expression.value === "number" && actual >= expression.value;
    case "lte": return typeof actual === "number" && typeof expression.value === "number" && actual <= expression.value;
    case "in": return Array.isArray(expression.value) && expression.value.includes(String(actual));
  }
}
