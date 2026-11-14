import { z } from "zod";
import { authenticated, jsonError, signedOperation } from "@/lib/btc-security";

export const runtime = "nodejs";
const schema = z.object({
  workspace: z.string().uuid(),
  workflow: z.string().uuid().optional(),
  expectedVersion: z.number().int().positive().optional(),
  title: z.string().trim().min(3).max(100),
  objective: z.string().trim().min(5).max(1200),
  provider: z.enum(["workspace","gmail","calendar","drive"]),
  operation: z.enum(["publish_record","send","create_event","update_event","move_file"]),
  resource: z.string().max(256),
  document: z.object({
    account: z.string().max(255).optional(),
    proposal: z.object({
      subject: z.string().trim().min(1).max(250),
      body: z.string().trim().min(1).max(12000),
      to: z.string().email().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      fileId: z.string().optional(),
      destinationId: z.string().optional()
    }),
    sensitive: z.boolean().default(false),
    risk: z.enum(["low","medium","high"]).default("medium")
  }).strict(),
  reviewers: z.array(z.string().uuid()).min(1).max(8)
}).strict().superRefine((v,ctx)=>{
  const allowed: Record<string,string[]> = {
    workspace:["publish_record"], gmail:["send"], calendar:["create_event","update_event"], drive:["move_file"]
  };
  if(!allowed[v.provider]?.includes(v.operation)) ctx.addIssue({code:"custom",message:"Unsupported provider operation."});
  if(v.provider==="gmail" && (!v.document.proposal.to || !v.document.account))
    ctx.addIssue({code:"custom",message:"Gmail needs a recipient and connected account."});
});

export async function POST(request: Request) {
  const actor = await authenticated();
  if (!actor) return Response.json({error:"Sign in to create a workflow."},{status:401});
  try {
    const data=schema.parse(await request.json());
    const signed=signedOperation(actor.user.id,"proposal",data);
    const result=await actor.supabase.rpc("btc_propose",signed);
    if(result.error) throw result.error;
    return Response.json({id:result.data},{status:201});
  } catch(e) { return jsonError(e); }
}
