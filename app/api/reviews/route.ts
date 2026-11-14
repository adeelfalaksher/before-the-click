import { timingSafeEqual } from "node:crypto";
import { BlobPreconditionFailedError } from "@vercel/blob";
import { z } from "zod";
import { nextReviewer, reviewDecision, validProposal } from "@/lib/engine";
import { reply, readJson, requestError, RequestError } from "@/lib/http";
import { actionLabels, choiceSchema, riskFor, runSchema, type Reviewer } from "@/lib/model";
import { createReviewSchema, reviewIdSchema, tokenSchema, type ReviewResponse } from "@/lib/review-contract";
import { hash, limit, readRecord, storeAvailable, writeRecord } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";

const days = 14;
const packetLimit = 48_000;
const decideSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("decide"), choice: choiceSchema, note: z.string().max(500) }),
  z.object({ op: z.literal("close") })
]);
type SharedRun = Omit<ReviewResponse, "reviewerId"> & {
  owner: string;
  invites: { id: string; digest: string }[];
};
const file = (id: string) => "reviews/" + id + ".json";

function matches(a: string, b: string) {
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function publicPacket(data: SharedRun, reviewerId?: string): ReviewResponse {
  return { packet: data.packet, reviewers: data.reviewers, closed: data.closed, expiresAt: data.expiresAt, reviewerId };
}

async function authorize(request: Request, forWrite = false) {
  const id = reviewIdSchema.safeParse(new URL(request.url).searchParams.get("id"));
  const auth = tokenSchema.safeParse(request.headers.get("authorization")?.replace(/^Bearer /, ""));
  if (!id.success || !auth.success) throw new RequestError(404, "This review link could not be found.");
  const path = file(id.data);
  const record = await readRecord<SharedRun>(path);
  if (!record) throw new RequestError(404, "This review link could not be found.");
  const digest = hash(auth.data);
  const owner = matches(record.data.owner, digest);
  const invite = record.data.invites.find(item => matches(item.digest, digest));
  if (!owner && !invite) throw new RequestError(404, "This review link could not be found.");
  if (Date.parse(record.data.expiresAt) <= Date.now()) throw new RequestError(410, "This review link has expired.");
  if (!owner && record.data.closed) throw new RequestError(410, "The workspace owner closed this review link.");
  if (forWrite) {
    const writable = await readRecord<SharedRun>(path, true);
    if (!writable || JSON.stringify(writable.data) !== JSON.stringify(record.data)) {
      throw new RequestError(409, "The review was updated. Refresh and try again.");
    }
    return { path, record: writable, owner, reviewerId: invite?.id };
  }
  return { path, record, owner, reviewerId: invite?.id };
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);
    return reply(publicPacket(auth.record.data, auth.reviewerId));
  } catch (error) { return requestError(error); }
}

export async function POST(request: Request) {
  try {
    if (!storeAvailable()) throw new RequestError(503, "Private review storage is unavailable.");
    const input = await readJson(request, createReviewSchema, packetLimit);
    const checked = runSchema.safeParse(input.run);
    if (!checked.success) throw new RequestError(400, "The review packet is incomplete.");
    const run = checked.data;
    if (run.result || run.archivedAt || !nextReviewer(run.reviewers) ||
        run.actions.some(action => !validProposal(run.scenario, run.sources, action))) {
      throw new RequestError(409, "Share a plan that is waiting for review.");
    }
    const inviteIds = new Set(input.invites.map(invite => invite.id));
    const allowedIds = new Set(run.reviewers.filter(item => item.status === "pending").map(item => item.id));
    if (input.invites.length !== allowedIds.size || inviteIds.size !== allowedIds.size ||
        input.invites.some(invite => !allowedIds.has(invite.id)) ||
        new Set([input.ownerToken, ...input.invites.map(invite => invite.token)]).size !== input.invites.length + 1) {
      throw new RequestError(400, "Each pending reviewer needs a unique review link.");
    }
    const path = file(input.id);
    const owner = hash(input.ownerToken);
    const existing = await readRecord<SharedRun>(path);
    if (existing && matches(existing.data.owner, owner)) return reply(publicPacket(existing.data));
    if (existing) throw new RequestError(409, "Start a new set of review links.");
    await limit(request, "share", 12);
    const packet: SharedRun["packet"] = {
      title: run.title, objective: run.objective, scenario: run.scenario,
      actions: run.actions.filter(action => action.enabled).map(action => {
        const source = run.sources.find(item => item.id === action.target)!;
        return {
          title: action.label || actionLabels[action.kind].title,
          source: source.sensitive ? "Private source" : source.title,
          detail: source.sensitive ? "Private source details stay in the owner’s workspace." : source.detail,
          risk: riskFor(action, source)
        };
      })
    };
    const data: SharedRun = {
      packet, owner, reviewers: run.reviewers,
      invites: input.invites.map(invite => ({ id: invite.id, digest: hash(invite.token) })),
      closed: false, expiresAt: new Date(Date.now() + days * 86_400_000).toISOString()
    };
    try {
      await writeRecord(path, data, days);
    } catch (error) {
      const written = await readRecord<SharedRun>(path);
      if (written && matches(written.data.owner, owner)) return reply(publicPacket(written.data));
      throw error;
    }
    return reply(publicPacket(data), 201);
  } catch (error) { return requestError(error); }
}

export async function PATCH(request: Request) {
  try {
    const input = await readJson(request, decideSchema, 1600);
    const { path, record, owner, reviewerId } = await authorize(request, true);
    const data = record.data;
    if (input.op === "close") {
      if (!owner) throw new RequestError(403, "Only the workspace owner can close a review link.");
      if (data.closed) return reply(publicPacket(data));
      data.closed = true;
    } else {
      if (!reviewerId) throw new RequestError(403, "Open your individual review link to record a decision.");
      const past = data.reviewers.find(item => item.id === reviewerId);
      if (past?.status === input.choice && past.note === input.note.trim()) return reply(publicPacket(data, reviewerId));
      try {
        data.reviewers = reviewDecision(data.reviewers as Reviewer[], reviewerId, input.choice, input.note);
      } catch (error) {
        throw new RequestError(409, (error as Error).message);
      }
    }
    try { await writeRecord(path, data, days, record.etag); }
    catch (error) {
      if (error instanceof BlobPreconditionFailedError) throw new RequestError(409, "The review was updated. Refresh and try again.");
      throw error;
    }
    return reply(publicPacket(data, reviewerId));
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) return reply({ error: "The review was updated. Refresh and try again." }, 409);
    return requestError(error);
  }
}
