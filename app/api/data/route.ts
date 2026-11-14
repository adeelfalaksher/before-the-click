import {z} from "zod";
import {bridge} from "@/lib/data-bridge";
import {getSession} from "@/lib/server-account";
import {requireSameOrigin} from "@/lib/auth-request";
import {readJson,reply,requestError} from "@/lib/http";

const id=z.string().uuid();
const fileTypes=["application/pdf","image/jpeg","image/png","text/plain","application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
const params=z.discriminatedUnion("action",[
  z.object({action:z.literal("workspaces")}),
  z.object({action:z.literal("snapshot"),workspace:id}),
  z.object({action:z.literal("btc_workspace"),name:z.string().trim().min(2).max(100)}),
  z.object({action:z.literal("btc_profile"),name:z.string().trim().min(1).max(80)}),
  z.object({action:z.literal("btc_join"),d:z.string().regex(/^[a-f0-9]{64}$/)}),
  z.object({action:z.literal("btc_cancel"),f:id}),
  z.object({action:z.literal("btc_decide"),f:id,v:id,d:z.enum(["approved","changes_requested","rejected"]),note:z.string().trim().max(500)}),
  z.object({action:z.literal("btc_policies"),w:id,sending:z.boolean(),calendar:z.boolean(),drive:z.boolean(),self_approval:z.boolean()}),
  z.object({action:z.literal("btc_notification"),n:z.string().regex(/^\d{1,18}$/)}),
  z.object({action:z.literal("btc_export_audit"),w:id}),
  z.object({action:z.literal("btc_member_role"),w:id,member:id,new_role:z.enum(["admin","reviewer","member"])}),
  z.object({action:z.literal("file_upload"),workspace:id}),
  z.object({action:z.literal("file_add"),workspace:id,path:z.string().max(150),filename:z.string().min(1).max(180),
    mime:z.enum(fileTypes),size:z.number().int().min(1).max(10485760)}),
  z.object({action:z.literal("file_remove"),id})
]);

export async function POST(request:Request){
  try{
    requireSameOrigin(request);
    const session=await getSession();
    if(!session)return reply({error:"Sign in first."},401);
    const {action,...input}=await readJson(request,params,5000);
    return reply({data:await bridge(action,input,session)});
  }catch(error){return requestError(error);}
}
