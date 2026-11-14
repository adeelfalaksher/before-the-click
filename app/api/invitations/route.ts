import {requireSameOrigin} from "@/lib/auth-request";
import { createHash,randomBytes } from "node:crypto";
import { z } from "zod";
import { authenticated,jsonError } from "@/lib/btc-security";
import {usernameField} from "@/lib/account-fields";
export const runtime="nodejs";
const schema=z.object({
 workspace:z.string().uuid(), username:usernameField,
 role:z.enum(["admin","reviewer","member"]).default("reviewer")
});
export async function POST(request:Request){
  try { requireSameOrigin(request); } catch { return Response.json({error:"This request must come from Before the Click."},{status:403}); }
 const actor=await authenticated();
 if(!actor)return Response.json({error:"Sign in first."},{status:401});
 try {
  const input=schema.parse(await request.json());
  const token=randomBytes(32).toString("hex");
  const digest=createHash("sha256").update(token).digest("hex");
  await actor.data("btc_invite",{w:input.workspace,address:input.username,member_role:input.role,digest});
  const base=process.env.APP_URL||new URL(request.url).origin;
  return Response.json({url:base.replace(/\/$/,"")+"/join?token="+token,username:input.username});
 }catch(e){return jsonError(e);}
}
