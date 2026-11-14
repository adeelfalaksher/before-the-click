import { z } from "zod";

export const scenarioIds = ["inbox", "calendar", "files"] as const;
export const actionKinds = ["archive", "draft", "send", "reschedule", "move", "share", "delete", "preserve"] as const;

const text = (length: number) => z.string().max(length);
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
export const scenarioIdSchema = z.enum(scenarioIds);
export const kindSchema = z.enum(actionKinds);
export const choiceSchema = z.enum(["approved", "changes", "rejected"]);
export const sourceSchema = z.object({
  id: identifier,
  title: text(140).min(1),
  detail: text(600),
  sensitive: z.boolean()
});
const proposalFields = { kind: kindSchema, target: identifier };
export const actionSchema = z.object({
  id: identifier,
  ...proposalFields,
  enabled: z.boolean(),
  label: text(160).optional(),
  detail: text(600).optional()
});
export const reviewerSchema = z.object({
  id: identifier,
  name: text(60).min(1),
  role: text(60),
  instructions: text(240),
  status: z.enum(["pending", "approved", "changes", "rejected"]),
  note: text(500),
  decidedAt: text(40).nullable()
});
export const policySchema = z.object({
  external: z.boolean(),
  destructive: z.boolean(),
  privacy: z.boolean()
});
const entrySchema = z.object({
  at: text(40),
  actor: text(80),
  detail: text(650)
});
const sandboxRecordSchema = z.object({
  id: identifier, title: text(140), location: text(320), archived: z.boolean(),
  deleted: z.boolean(), shared: z.boolean(), notices: z.number().int().min(0),
  drafts: z.array(text(900)).max(24)
});
const resultSchema = z.object({
  at: text(40),
  policy: policySchema,
  state: z.object({ before: z.array(sandboxRecordSchema), after: z.array(sandboxRecordSchema) }).optional(),
  rows: z.array(z.object({
    id: identifier,
    status: z.enum(["applied", "blocked", "skipped"]),
    message: text(260),
    before: text(300),
    after: text(450),
    draft: text(900).optional()
  })).max(24)
});
export const runSchema = z.object({
  id: identifier,
  title: text(100).min(1),
  objective: text(1200).min(1),
  scenario: scenarioIdSchema,
  mode: z.enum(["guided", "gemini"]),
  createdAt: text(40),
  updatedAt: text(40),
  archivedAt: text(40).nullable(),
  sources: z.array(sourceSchema).min(1).max(12),
  actions: z.array(actionSchema).min(1).max(24),
  reviewers: z.array(reviewerSchema).min(1).max(8),
  activity: z.array(entrySchema).max(150),
  result: resultSchema.nullable(),
  legacyAudit: z.string().max(120_000).optional()
}).superRefine((run, ctx) => {
  for (const collection of [run.sources, run.actions, run.reviewers]) {
    if (new Set(collection.map(item => item.id)).size !== collection.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate record ID." });
    }
  }
  if (run.actions.some(action => !run.sources.some(source => source.id === action.target))) {
    ctx.addIssue({ code: "custom", message: "An action is missing its source." });
  }
  if (!run.actions.some(action => action.enabled)) {
    ctx.addIssue({ code: "custom", message: "Select at least one action." });
  }
  let pending = false;
  for (const reviewer of run.reviewers) {
    if (pending && reviewer.status !== "pending") {
      ctx.addIssue({ code: "custom", message: "Reviewers must decide in order." });
    }
    if (reviewer.status !== "approved") pending = true;
  }
  if (run.result && (pending || run.result.rows.length !== run.actions.length ||
        run.actions.some(action => !run.result?.rows.some(row => row.id === action.id)))) {
    ctx.addIssue({ code: "custom", message: "The audit record has inconsistent approvals or results." });
  }
});

export const backupSchema = z.object({
  format: z.literal("before-the-click.workspace"),
  version: z.literal(2),
  workflows: z.array(runSchema).max(50),
  policy: policySchema
});

export type ScenarioId = z.infer<typeof scenarioIdSchema>;
export type Kind = z.infer<typeof kindSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Choice = z.infer<typeof choiceSchema>;
export type Reviewer = z.infer<typeof reviewerSchema>;
export type Policy = z.infer<typeof policySchema>;
export type Run = z.infer<typeof runSchema>;
export type Result = NonNullable<Run["result"]>;
export type SandboxRecord = z.infer<typeof sandboxRecordSchema>;
export type ActionProposal = { kind: Kind; target: string };
export type Phase = "review" | "changes" | "rejected" | "ready" | "completed" | "archived";

export const defaultPolicy: Policy = { external: true, destructive: true, privacy: true };

export const scenarios: Record<ScenarioId, {
  label: string;
  title: string;
  description: string;
  goal: string;
  sources: Source[];
  allowed: readonly Kind[];
  steps: ActionProposal[];
}> = {
  inbox: {
    label: "Inbox",
    title: "Triage a founder’s inbox",
    description: "Sort launch-week messages and prepare replies with a clear approval trail.",
    goal: "Prepare a response to the customer, archive the weekly roundup, and keep launch details private.",
    sources: [
      { id: "m1", title: "Customer interview request", detail: "A customer asks for a 20-minute interview this week. Confirm interest and ask for two time windows.", sensitive: false },
      { id: "m2", title: "Weekly industry roundup", detail: "The usual automated Friday newsletter.", sensitive: false },
      { id: "m3", title: "Unannounced launch date", detail: "Internal planning has a tentative release date. The date is confidential until launch.", sensitive: true },
      { id: "m4", title: "Partner launch announcement", detail: "A partner asks for a brief update on the launch planning process.", sensitive: false }
    ],
    allowed: ["draft", "archive", "send", "preserve"],
    steps: [{ kind: "draft", target: "m1" }, { kind: "archive", target: "m2" }, { kind: "send", target: "m3" }, { kind: "preserve", target: "m4" }]
  },
  calendar: {
    label: "Calendar",
    title: "Resolve a calendar clash",
    description: "Rehearse moving an internal meeting while keeping a customer appointment in place.",
    goal: "Move the internal roadmap meeting to the next available slot and protect the customer interview.",
    sources: [
      { id: "c1", title: "Roadmap stand-up", detail: "Tuesday 10:00–10:30 · internal product team", sensitive: false },
      { id: "c2", title: "Customer interview", detail: "Tuesday 10:00–10:30 · external guest", sensitive: false },
      { id: "c3", title: "Investor preparation", detail: "Tuesday 14:00–14:30 · confidential strategy", sensitive: true }
    ],
    allowed: ["reschedule", "draft", "send", "preserve"],
    steps: [{ kind: "reschedule", target: "c1" }, { kind: "preserve", target: "c2" }, { kind: "draft", target: "c3" }]
  },
  files: {
    label: "Files",
    title: "Organize a shared folder",
    description: "Try organizing launch documents while keeping sensitive records protected.",
    goal: "Move the latest brief into Launch, review public share requests, and preserve confidential files.",
    sources: [
      { id: "f1", title: "Launch brief", detail: "General / Launch brief · latest internal copy", sensitive: false },
      { id: "f2", title: "Customer research notes", detail: "Research / Interview notes · private", sensitive: true },
      { id: "f3", title: "Old banner export", detail: "Assets / Banner old · duplicate", sensitive: false },
      { id: "f4", title: "Press fact sheet", detail: "PR / Fact sheet · public information", sensitive: false }
    ],
    allowed: ["move", "share", "delete", "preserve"],
    steps: [{ kind: "move", target: "f1" }, { kind: "share", target: "f2" }, { kind: "delete", target: "f3" }, { kind: "preserve", target: "f4" }]
  }
};

export const actionLabels: Record<Kind, { title: string; reason: string; risk: "Low" | "Medium" | "High" }> = {
  draft: { title: "Prepare draft", reason: "Create material for a person to check in the rehearsal.", risk: "Low" },
  archive: { title: "Archive record", reason: "Move the record out of the active sandbox inbox.", risk: "Low" },
  send: { title: "Send update", reason: "Test how the policy responds to an outbound message.", risk: "High" },
  reschedule: { title: "Reschedule meeting", reason: "Check a later time in the sandbox calendar.", risk: "Medium" },
  move: { title: "Move to Launch", reason: "Move the selected record into the Launch folder in the sandbox.", risk: "Low" },
  share: { title: "Share file", reason: "Test a change to external visibility.", risk: "High" },
  delete: { title: "Delete file", reason: "Check whether a removal is allowed by the sandbox rules.", risk: "High" },
  preserve: { title: "Keep as is", reason: "Retain the record in its current state.", risk: "Low" }
};

export function riskFor(action: ActionProposal, source: Source) {
  if (source.sensitive && action.kind !== "preserve") return "High";
  return actionLabels[action.kind].risk;
}

export function phase(run: Run): Phase {
  if (run.archivedAt) return "archived";
  if (run.result) return "completed";
  if (run.reviewers.some(reviewer => reviewer.status === "changes")) return "changes";
  if (run.reviewers.some(reviewer => reviewer.status === "rejected")) return "rejected";
  if (run.reviewers.every(reviewer => reviewer.status === "approved")) return "ready";
  return "review";
}

export const phaseLabels: Record<Phase, string> = {
  review: "In review", changes: "Changes requested", rejected: "Rejected",
  ready: "Ready to run", completed: "Completed", archived: "Archived"
};
