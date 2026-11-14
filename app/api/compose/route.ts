import {requireSameOrigin} from "@/lib/auth-request";
import { z } from "zod";
import { authenticated } from "@/lib/btc-security";
import { readJson, reply, requestError } from "@/lib/http";
import { limit } from "@/lib/store";
import { draftAvailability, writeDraft } from "@/lib/drafting";

export const runtime = "nodejs";
export const maxDuration = 25;

const schema = z.object({
  objective: z.string().trim().min(8).max(1200),
  context: z.string().max(4000).default(""),
  kind: z.enum(["record", "email"]).default("record"),
  provider: z.enum(["auto","openrouter"]).default("auto")
});

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch { return Response.json({error:"This request must come from Before the Click."},{status:403}); }
  if (!await authenticated()) return reply({error:"Sign in first."}, 401);
  try {
    const input = await readJson(request, schema, 24_000);
    const providers = draftAvailability();
    if(input.provider==="openrouter")providers.gemini=false;
    if (!providers.gemini && !providers.openrouter) return reply({error:"AI drafting is not configured."}, 503);
    await limit(request, "workspace-draft", 20);
    return reply(await writeDraft({objective:input.objective,context:input.context??"",kind:input.kind??"record"}, providers));
  } catch (error) {
    return requestError(error);
  }
}
