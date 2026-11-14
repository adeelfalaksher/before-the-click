import { createHash,randomBytes } from "node:crypto";
import { z } from "zod";
import { authenticated,jsonError } from "@/lib/btc-security";
export const runtime="nodejs";
const schema=z.object({
 workspace:z.string().uuid(), email:z.string().email().max(254),
 role:z.enum(["admin","reviewer","member"]).default("reviewer")
});
export async function POST(request:Request){
 const actor=await authenticated();
 if(!actor)return Response.json({error:"Sign in first."},{status:401});
 try {
  const input=schema.parse(await request.json());
  const token=randomBytes(32).toString("hex");
  const digest=createHash("sha256").update(token).digest("hex");
  const {error}=await actor.supabase.rpc("btc_invite",{w:input.workspace,address:input.email,member_role:input.role,digest});
  if(error)throw error;
  const base=process.env.APP_URL||new URL(request.url).origin;
  return Response.json({url:base.replace(/\/$/,"")+"/join?token="+token,email:input.email});
 }catch(e){return jsonError(e);}
}
