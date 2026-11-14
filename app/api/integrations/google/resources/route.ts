import {z} from "zod";
import {NextRequest} from "next/server";
import {authenticated,jsonError} from "@/lib/btc-security";
import {getToken,googleFetch} from "@/lib/google";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.object({workspace:z.string().uuid(),provider:z.enum(["gmail","calendar","drive"]),resource:z.string().regex(/^[A-Za-z0-9_-]{1,256}$/).optional()});
function header(headers:{name:string;value:string}[]|undefined,name:string){
 return headers?.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value||"";
}
function driveResource(file:Record<string,unknown>){
 return {id:file.id,title:file.name||"(Untitled file)",mimeType:file.mimeType,parents:file.parents||[],modifiedAt:file.modifiedTime};
}
export async function GET(request:NextRequest){
 const actor=await authenticated();
 if(!actor)return Response.json({error:"Sign in first."},{status:401});
 try{
  const options=schema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  const {provider,workspace,resource}=options;
  const {token,account}=await getToken(actor,workspace,provider);
  const output:{provider:string;account:string;items:Record<string,unknown>[];picker?:{clientId:string;projectNumber:string;apiKey:string}}={provider,account,items:[]};
  if(provider==="gmail"){
   const params=new URLSearchParams({maxResults:"12",labelIds:"INBOX"});
   const list=await googleFetch(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages?"+params);
   const ids=(await list.json()).messages as {id:string}[]|undefined;
   const responses=await Promise.allSettled((ids||[]).slice(0,12).map(async m=>{
    const q=new URLSearchParams({format:"metadata"});
    for(const h of ["From","Subject","Date","Message-ID"])q.append("metadataHeaders",h);
    const response=await googleFetch(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages/"+
      encodeURIComponent(m.id)+"?"+q);
    const detail=await response.json();
    const headers=detail.payload?.headers as {name:string;value:string}[]|undefined;
    return {id:detail.id,threadId:detail.threadId,from:header(headers,"From"),
     subject:header(headers,"Subject")||"(No subject)",inReplyTo:header(headers,"Message-ID"),
     snippet:String(detail.snippet||"").slice(0,700),
     receivedAt:detail.internalDate?new Date(Number(detail.internalDate)).toISOString():header(headers,"Date")};
   }));
   output.items=responses.flatMap(r=>r.status==="fulfilled"?[r.value]:[]);
   if(ids?.length&&!output.items.length)throw new Error("Gmail could not load the listed inbox messages. Try again or reconnect.");
  }else if(provider==="calendar"){
   const q=new URLSearchParams({maxResults:"25",singleEvents:"true",orderBy:"startTime",
    timeMin:new Date(Date.now()-86400000).toISOString()});
   const response=await googleFetch(token,
     "https://www.googleapis.com/calendar/v3/calendars/primary/events?"+q);
   const rows=(await response.json()).items as Record<string,unknown>[]|undefined;
   output.items=(rows||[]).filter(e=>e.status!=="cancelled").map(e=>({
     id:e.id,title:e.summary||"(Untitled event)",description:String(e.description||"").slice(0,3000),
     start:(e.start as {dateTime?:string;date?:string}|undefined)?.dateTime||(e.start as {dateTime?:string;date?:string}|undefined)?.date,
     end:(e.end as {dateTime?:string;date?:string}|undefined)?.dateTime||(e.end as {dateTime?:string;date?:string}|undefined)?.date,
     etag:e.etag,status:e.status
   }));
  }else{
   const fields="id,name,mimeType,parents,modifiedTime,trashed";
   if(resource){
    const result=await googleFetch(token,"https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(resource)+"?"+new URLSearchParams({fields}));
    const file=await result.json();
    if(file.id!==resource||file.trashed)throw new Error("Choose a current Drive item that this connection can access.");
    output.items=[driveResource(file)];
   }else{
    const q=new URLSearchParams({pageSize:"40",q:"trashed = false",fields:`files(${fields})`,orderBy:"name"});
    const response=await googleFetch(token,"https://www.googleapis.com/drive/v3/files?"+q);
    const rows=(await response.json()).files as Record<string,unknown>[]|undefined;
    output.items=(rows||[]).map(driveResource);
    const {GOOGLE_CLIENT_ID,GOOGLE_PICKER_API_KEY,GOOGLE_CLOUD_PROJECT_NUMBER}=process.env;
    if(GOOGLE_CLIENT_ID&&GOOGLE_PICKER_API_KEY&&/^\d+$/.test(GOOGLE_CLOUD_PROJECT_NUMBER||"")){
     output.picker={clientId:GOOGLE_CLIENT_ID,projectNumber:GOOGLE_CLOUD_PROJECT_NUMBER!,apiKey:GOOGLE_PICKER_API_KEY};
    }
   }
  }
  return Response.json(output,{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return jsonError(e,"Could not retrieve resources from Google.");}
}
