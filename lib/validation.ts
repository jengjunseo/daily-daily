import { z } from "zod";
import type { ActivityLog } from "@/lib/domain";

const nonnegative = z.number().finite().min(0).max(10_000);
const rating = z.number().int().min(1).max(5);
const optionalText = z.string().max(200).optional();
const detailValidators: Record<string, z.ZodType> = {
  sleep: z.object({ sleepType: z.enum(["night", "nap", "powernap", "sleepless"]).optional(), quality: rating.optional(), satisfaction: rating.optional() }).passthrough(),
  meal: z.object({ mealType: optionalText, amount: z.enum(["adequate", "hearty", "hardly", "overeat"]).optional(), form: optionalText, menu: optionalText, satisfaction: rating.optional(), withSomeone: z.boolean().optional() }).passthrough(),
  study: z.object({ subject: optionalText, method: optionalText, problems: nonnegative.optional(), correct: nonnegative.optional(), focus: rating.optional(), understanding: rating.optional() }).passthrough(),
  development: z.object({ project: optionalText, workType: optionalText, result: optionalText, solvedProblems: nonnegative.optional() }).passthrough(),
  exercise: z.object({ metricType: z.enum(["strength", "cardio", "flex", "sport"]).optional(), exerciseType: optionalText, distanceKm: nonnegative.optional(), sets: nonnegative.optional(), reps: nonnegative.optional(), weightKg: nonnegative.optional(), rpe: z.number().int().min(1).max(10).optional() }).passthrough(),
  reading: z.object({ book: optionalText, genre: optionalText, completed: z.boolean().optional() }).passthrough(),
};

export const ActivityLogSchema = z.object({
  id: z.uuid(), categoryKey: z.string().min(1).max(100), typeKey: z.string().min(1).max(100), status: z.enum(["in_progress", "completed"]),
  startedAt: z.iso.datetime(), endedAt: z.iso.datetime().nullable(), durationMin: z.number().int().min(0).max(1440), attributedDate: z.iso.date(),
  mood: z.number().int().min(1).max(5).nullable(), details: z.record(z.string(), z.unknown()), note: z.string().max(500), source: z.enum(["quick", "detailed", "timer"]), version: z.number().int().min(1), deletedAt: z.iso.datetime().nullable(),
  customTraits: z.record(z.string(), z.number().min(0).max(1)).optional(), customTag: z.string().max(100).optional(),
}).superRefine((log, context) => {
  if (log.endedAt && new Date(log.endedAt).getTime() < new Date(log.startedAt).getTime()) context.addIssue({ code: "custom", path: ["endedAt"], message: "종료 시각은 시작 시각보다 뒤여야 합니다." });
  if (log.status === "in_progress" && log.endedAt !== null) context.addIssue({ code: "custom", path: ["endedAt"], message: "진행 중 기록에는 종료 시각을 넣을 수 없습니다." });
  const details = detailValidators[log.categoryKey];
  if (details) {
    const parsed = details.safeParse(log.details);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ code: "custom", path: ["details", ...issue.path], message: issue.message });
  }
});

export function validateActivityLog(input: unknown): { success: true; data: ActivityLog } | { success: false; message: string } {
  const parsed = ActivityLogSchema.safeParse(input);
  return parsed.success ? { success: true, data: parsed.data as ActivityLog } : { success: false, message: parsed.error.issues[0]?.message ?? "기록 내용을 확인해 주세요." };
}
