import { z } from "zod";
import { authenticated, jsonError, signedOperation } from "@/lib/btc-security";
import { executeGoogleAction, getToken, googleConfigured } from "@/lib/google";

export const runtime="nodejs";
const inputSchema=z.object({workflow:z.string().uuid()});
export async function POST(request:Request) {
  const actor=await authenticated();
  if(!actor) return Response.json({error:"Sign in first."},{status:401});
  try {
    const {workflow}=inputSchema.parse(await request.json());
    const {data:w,error:we}=await actor.supabase.from("workflows")
      .select("id,workspace_id,created_by,current_version,status").eq("id",workflow).single();
    if(we||!w||w.created_by!==actor.user.id) return Response.json({error:"Workflow not found."},{status:404});
    if(w.status!=="approved"&&w.status!=="completed") return Response.json({error:"Complete the required approvals first."},{status:409});
    const {data:v,error:ve}=await actor.supabase.from("workflow_versions")
      .select("id,version").eq("workflow_id",workflow).eq("version",w.current_version).single();
    if(ve||!v) return Response.json({error:"The workflow version was not found."},{status:409});
    const {data:action,error:ae}=await actor.supabase.from("proposed_actions")
      .select("provider,operation,resource_id,document").eq("version_id",v.id).single();
    if(ae||!action) return Response.json({error:"The proposed action was not found."},{status:409});

    if(action.provider==="workspace"&&action.operation==="publish_record") {
      const signature=signedOperation(actor.user.id,"publish",{workflow,version:v.id});
      const {data:id,error}=await actor.supabase.rpc("btc_publish_record",signature);
      if(error) throw error;
      const {data:verified,error:verifyError}=await actor.supabase.from("workspace_records")
        .select("id,title,body,created_at").eq("id",id).eq("workspace_id",w.workspace_id).single();
      if(verifyError||!verified) throw new Error("The record was saved but could not be independently verified.");
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
    const {data:run,error:claimError}=await actor.supabase.rpc("btc_execution",claim);
    if(claimError) throw claimError;
    let status:"completed"|"failed"|"needs_verification"="needs_verification";
    let reference="";
    let detail:Record<string,unknown>={};
    try {
      const result=await executeGoogleAction(actor, w.workspace_id, action);
      status="completed";reference=result.reference;detail=result.detail;
    } catch(e) {
      detail={message:e instanceof Error?e.message:"The provider operation could not be verified."};
      status="needs_verification";
    }
    const signed=signedOperation(actor.user.id,"execution",
      {intent:"finish",workflow,version:v.id,run:run.id,status,reference,detail});
    const {error:finishError}=await actor.supabase.rpc("btc_execution",signed);
    if(finishError) throw finishError;
    return Response.json({status,reference,detail},{status:status==="completed"?200:409});
  } catch(e) { return jsonError(e); }
}
