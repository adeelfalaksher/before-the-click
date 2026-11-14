import {requireSameOrigin} from "@/lib/auth-request";
import { z } from "zod";
import { authenticated, jsonError, signedOperation } from "@/lib/btc-security";
import { executeGoogleAction, getToken, googleConfigured, GoogleVerificationError } from "@/lib/google";

export const runtime="nodejs";
export const maxDuration=60;
const inputSchema=z.object({workflow:z.string().uuid(),version:z.string().uuid()});
export async function POST(request:Request) {
  try { requireSameOrigin(request); } catch { return Response.json({error:"This request must come from Before the Click."},{status:403}); }
  const actor=await authenticated();
  if(!actor) return Response.json({error:"Sign in first."},{status:401});
  try {
    const parsed=inputSchema.safeParse(await request.json());
    if(!parsed.success) return Response.json({error:"Reopen the workflow and confirm its current version."},{status:400});
    const {workflow,version}=parsed.data;
    const w=await actor.data<{id:string;workspace_id:string;created_by:string;current_version:number;status:string}|null>("workflow",{id:workflow});
    if(!w||w.created_by!==actor.user.id) return Response.json({error:"Workflow not found."},{status:404});
    if(w.status!=="approved"&&w.status!=="completed") return Response.json({error:"Complete the required approvals first."},{status:409});
    const v=await actor.data<{id:string}|null>("version",{workflow,version:w.current_version});
    if(!v||v.id!==version) return Response.json({error:"The workflow changed. Review its latest version before executing."},{status:409});
    const action=await actor.data<{provider:string;operation:string;resource_id:string;document:unknown}|null>("proposal",{version:v.id});
    if(!action) return Response.json({error:"The proposed action was not found."},{status:409});

    if(action.provider==="workspace"&&action.operation==="publish_record") {
      const signature=signedOperation(actor.user.id,"publish",{workflow,version:v.id});
      const id=await actor.data<string>("btc_publish_record",signature);
      const verified=await actor.data("record",{id,workspace:w.workspace_id});
      if(!verified)throw new Error("The record was saved but could not be independently verified.");
      return Response.json({status:"completed",reference:id,record:verified});
    }

    if(w.status==="completed") return Response.json({error:"This action has already been executed."},{status:409});
    if(!["gmail","calendar","drive"].includes(action.provider)) {
      return Response.json({error:"No executable connector exists for this action."},{status:409});
    }
    if(!googleConfigured()) return Response.json({error:"Google OAuth credentials are not configured."},{status:503});
    const preflight=await getToken(actor,w.workspace_id,action.provider as "gmail"|"calendar"|"drive");
    if(preflight.account!==(action.document as {account?:string})?.account) return Response.json({error:"The approved account is not connected."},{status:409});
    const claim=signedOperation(actor.user.id,"execution",{intent:"claim",workflow,version:v.id});
    const run=await actor.data<{id:string}>("btc_execution",claim);
    let status:"completed"|"failed"|"needs_verification"="needs_verification";
    let reference="";
    let detail:Record<string,unknown>={};
    try {
      const result=await executeGoogleAction(actor, w.workspace_id, action);
      status="completed";reference=result.reference;detail=result.detail;
    } catch(e) {
      if(e instanceof GoogleVerificationError)reference=e.reference;
      detail={...(e instanceof GoogleVerificationError?e.detail:{}),message:e instanceof Error?e.message:"The provider operation could not be verified."};
      status="needs_verification";
    }
    const signed=signedOperation(actor.user.id,"execution",
      {intent:"finish",workflow,version:v.id,run:run.id,status,reference,detail});
    await actor.data("btc_execution",signed);
    return Response.json({status,reference,detail},{status:status==="completed"?200:409});
  } catch(e) { return jsonError(e); }
}
