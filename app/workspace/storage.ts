import { z } from "zod";
import { backupSchema, defaultPolicy, type Policy, type Run } from "@/lib/model";
import { upgradePolicy, upgradeRuns } from "@/lib/legacy";
import { reviewIdSchema, reviewResponseSchema, tokenSchema } from "@/lib/review-contract";

const dataKey = "before-the-click.workspace.v2";
export const maxBackupSize = 3_500_000;

const sharedSchema = z.object({
  id: reviewIdSchema,
  ownerToken: tokenSchema,
  invites: z.array(z.object({ id: z.string(), token: tokenSchema })).max(8),
  published: z.boolean(),
  expiresAt: z.string().optional()
});
const sharedMapSchema = z.record(sharedSchema);
export type Share = z.infer<typeof sharedSchema>;

export type Data = { workflows: Run[]; policy: Policy; shares: Record<string, Share> };

export function encodedBackup(workflows: Run[], policy: Policy) {
  return backupSchema.parse({ format: "before-the-click.workspace", version: 2, workflows, policy });
}

export function loadWorkspace(): Data | null {
  const modern = localStorage.getItem(dataKey);
  if (modern) {
    const parsed = JSON.parse(modern);
    return { ...backupSchema.parse(parsed), shares: sharedMapSchema.parse(parsed.shares ?? {}) };
  }
  const previous = localStorage.getItem("before-the-click.workspace.v1");
  if (!previous) return null;
  const oldPolicy = localStorage.getItem("before-the-click.policy.v1");
  const policy = oldPolicy ? upgradePolicy(JSON.parse(oldPolicy)) : defaultPolicy;
  const legacy = z.array(z.unknown()).max(50).parse(JSON.parse(previous));
  return { workflows: upgradeRuns(legacy, policy), policy, shares: {} };
}

export function saveWorkspace(data: Data) {
  localStorage.setItem(dataKey, JSON.stringify({ ...encodedBackup(data.workflows, data.policy), shares: data.shares }));
}

export function readBackup(raw: unknown) {
  const modern = backupSchema.safeParse(raw);
  if (modern.success) return modern.data;
  const legacy = z.object({
    format: z.literal("before-the-click.workspace"), version: z.literal(1),
    workflows: z.array(z.unknown()).max(50), policy: z.unknown()
  }).parse(raw);
  const policy = upgradePolicy(legacy.policy);
  return encodedBackup(upgradeRuns(legacy.workflows, policy), policy);
}

export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function readResponse(response: Response) {
  const body = await response.json();
  if (response.status === 410) return { expired: true as const };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load the review.");
  return { expired: false as const, value: reviewResponseSchema.parse(body) };
}

export const shareHeaders = (token: string) => ({ Authorization: "Bearer " + token, "Content-Type": "application/json" });
