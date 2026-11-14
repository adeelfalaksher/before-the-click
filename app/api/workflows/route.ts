import {requireSameOrigin} from "@/lib/auth-request";
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
  operation: z.enum(["publish_record","send","create_event","move_file"]),
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
    workspace:["publish_record"], gmail:["send"], calendar:["create_event"], drive:["move_file"]
  };
  if(!allowed[v.provider]?.includes(v.operation)) ctx.addIssue({code:"custom",message:"Unsupported provider operation."});
  if(v.workflow && !v.expectedVersion) ctx.addIssue({code:"custom",message:"Reload the latest version before editing."});
  const {subject,body,to,start,end,fileId,destinationId}=v.document.proposal;
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  if(v.provider!=="workspace"&&!v.document.account) issue("Choose a connected account.");
  if(v.provider==="workspace"&&(subject.length>200||body.length>10000)) issue("Workspace records have a 200-character title limit and a 10,000-character body limit.");
  if(v.provider==="gmail"&&!to) issue("Gmail needs a recipient.");
  const timestamp=z.string().datetime({offset:true});
  if(v.provider==="calendar"&&(!timestamp.safeParse(start).success||!timestamp.safeParse(end).success||Date.parse(end!)<=Date.parse(start!)))
    issue("Choose a valid start time and a later end time.");
  const driveId=/^[A-Za-z0-9_-]{1,256}$/;
  if(v.provider==="drive"&&(!driveId.test(fileId||"")||!driveId.test(destinationId||"")||fileId===destinationId))
    issue("Choose a Drive file and a different destination folder.");
});

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch { return Response.json({error:"This request must come from Before the Click."},{status:403}); }
  const actor = await authenticated();
  if (!actor) return Response.json({error:"Sign in to create a workflow."},{status:401});
  try {
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success) return Response.json({error:parsed.error.issues[0]?.message||"Check the proposal fields."},{status:400});
    const data=parsed.data;
    const signed=signedOperation(actor.user.id,"proposal",data);
    const id=await actor.data<string>("btc_propose",signed);
    return Response.json({id},{status:201});
  } catch(e) { return jsonError(e); }
}
