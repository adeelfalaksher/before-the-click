import { z } from "zod";
import { kindSchema, policySchema, runSchema, scenarioIdSchema, type Policy, type Run, type Source } from "./model.ts";

const oldReviewer = z.object({
  id: z.string(), name: z.string(), role: z.string().optional(), instructions: z.string().optional(),
  status: z.enum(["pending", "approved", "changes_requested", "rejected"]),
  comment: z.string().optional(), reviewedAt: z.string().nullable().optional()
});
const oldAction = z.object({
  id: z.string(), kind: kindSchema, title: z.string(), detail: z.string(),
  target: z.string(), status: z.enum(["queued", "applied", "blocked", "skipped"]),
  blockedReason: z.string().optional()
});
const oldRun = z.object({
  id: z.string(), title: z.string(), objective: z.string(), scenario: scenarioIdSchema,
  createdAt: z.string(), updatedAt: z.string(), executedAt: z.string().nullable(), archivedAt: z.string().nullable(),
  before: z.object({
    messages: z.array(z.object({ id: z.string(), subject: z.string(), body: z.string(), tag: z.string() })),
    events: z.array(z.object({ id: z.string(), title: z.string(), time: z.string(), people: z.string() })),
    files: z.array(z.object({ id: z.string(), name: z.string(), folder: z.string(), shared: z.boolean() }))
  }),
  reviewers: z.array(oldReviewer),
  actions: z.array(oldAction),
  activity: z.array(z.object({ at: z.string(), actor: z.string(), message: z.string() }))
});

export function upgradePolicy(input: unknown): Policy {
  const modern = policySchema.safeParse(input);
  if (modern.success) return modern.data;
  const legacy = z.object({ blockExternalSend: z.boolean(), blockDelete: z.boolean(), protectSensitive: z.boolean() }).parse(input);
  return { external: legacy.blockExternalSend, destructive: legacy.blockDelete, privacy: legacy.protectSensitive };
}

export function upgradeRuns(input: unknown[], policy: Policy): Run[] {
  return input.map(item => {
    const previous = oldRun.parse(item);
    const ids = new Set(previous.actions.map(action => action.target));
    const sources: Source[] = [
      ...previous.before.messages.map(record => ({
        id: record.id, title: record.subject, detail: record.body, sensitive: /confidential/i.test(record.tag)
      })),
      ...previous.before.events.map(record => ({
        id: record.id, title: record.title, detail: record.time + " · " + record.people, sensitive: false
      })),
      ...previous.before.files.map(record => ({
        id: record.id, title: record.name, detail: record.folder, sensitive: !record.shared && /private|payroll/i.test(record.folder + record.name) || record.id === "f2"
      }))
    ].filter(source => ids.has(source.id));
    return runSchema.parse({
      ...previous, mode: "guided", sources,
      actions: previous.actions.map(action => ({
        id: action.id, kind: action.kind, target: action.target, enabled: true, label: action.title, detail: action.detail
      })),
      reviewers: previous.reviewers.map(reviewer => ({
        ...reviewer, role: reviewer.role ?? "", instructions: reviewer.instructions ?? "",
        status: reviewer.status === "changes_requested" ? "changes" : reviewer.status,
        note: reviewer.comment ?? "", decidedAt: reviewer.reviewedAt ?? null
      })),
      activity: previous.activity.slice(-150).map(entry => ({ ...entry, detail: entry.message })),
      result: previous.executedAt ? {
        at: previous.executedAt, policy, rows: previous.actions.map(action => ({
          id: action.id, status: action.status === "queued" ? "skipped" : action.status,
          before: "See original sandbox record",
          after: action.status === "applied" ? "Applied in the original sandbox run" : "Unchanged",
          message: action.blockedReason || "Migrated from the original rehearsal."
        }))
      } : null,
      legacyAudit: JSON.stringify(item)
    });
  });
}
