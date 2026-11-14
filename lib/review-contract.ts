import { z } from "zod";
import { reviewerSchema, scenarioIdSchema } from "./model.ts";

export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const reviewIdSchema = z.string().uuid();
export const createReviewSchema = z.object({
  id: reviewIdSchema,
  ownerToken: tokenSchema,
  invites: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    token: tokenSchema
  })).max(8),
  run: z.unknown()
});

export const reviewPacketSchema = z.object({
  title: z.string().max(100),
  objective: z.string().max(1200),
  scenario: scenarioIdSchema,
  actions: z.array(z.object({
    title: z.string(), source: z.string(), detail: z.string(), risk: z.enum(["Low", "Medium", "High"])
  })).max(24)
});
export const reviewResponseSchema = z.object({
  packet: reviewPacketSchema,
  reviewers: z.array(reviewerSchema).max(8),
  closed: z.boolean(),
  expiresAt: z.string(),
  reviewerId: z.string().optional()
});
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
