import "server-only";
import { createCipheriv,createDecipheriv,createHash,randomBytes } from "node:crypto";
import type { authenticated } from "@/lib/btc-security";
import { signedOperation } from "@/lib/btc-security";
type Actor=NonNullable<Awaited<ReturnType<typeof authenticated>>>;
export type Provider="gmail"|"calendar"|"drive";
type Token={access_token:string;refresh_token:string;expires_at:number;scope:string;token_type:string};
type Action={provider:string;operation:string;resource_id:string;document:unknown};
const scopes:Record<Provider,string[]>={
 gmail:["https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/gmail.send"],
 calendar:["https://www.googleapis.com/auth/calendar.events"],
 drive:["https://www.googleapis.com/auth/drive.file"]
};
export function oauthScopes(p:Provider){return ["openid","email",...scopes[p]];}
export function googleConfigured(){return Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);}
export function oauthRedirect(){return process.env.GOOGLE_REDIRECT_URI||(process.env.APP_URL||"https://before-the-click.vercel.app")+"/api/integrations/google/callback";}
const encryptionKey=()=>{
 const secret=process.env.BTC_SERVER_SECRET;
 if(!secret)throw new Error("Credential encryption is not configured.");
 return createHash("sha256").update("btc.google.credentials.v1:"+secret).digest();
};
export function encryptToken(data:Token):string{
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(data),"utf8"),cipher.final()]);
 return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function decryptToken(ciphertext:string):Token{
 const [iv,tag,data]=ciphertext.split(".");
 if(!iv||!tag||!data)throw new Error("Stored credentials are invalid.");
 const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));
 decipher.setAuthTag(Buffer.from(tag,"base64url"));
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8")) as Token;
}
export async function saveToken(actor:Actor,workspace:string,provider:Provider,account:string,token:Token){
 const operation=signedOperation(actor.user.id,"connection",
  {intent:"set",workspace,provider,account,scopes:token.scope.split(" ").filter(Boolean),ciphertext:encryptToken(token)});
 await actor.data("btc_connection",operation);
}
export async function getToken(actor:Actor,workspace:string,provider:Provider):Promise<{token:Token;account:string}>{
 const operation=signedOperation(actor.user.id,"connection",{intent:"get",workspace,provider});
 const data=await actor.data<{ciphertext:string;account:string}|null>("btc_connection",operation);
 if(!data||!data.ciphertext)throw new Error("Connect the selected Google account first.");
 let token=decryptToken(data.ciphertext);
 if(token.expires_at<Date.now()+1000*90){
  if(!token.refresh_token)throw new Error("Google authorization has expired. Reconnect the account.");
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||"",client_secret:process.env.GOOGLE_CLIENT_SECRET||"",
      grant_type:"refresh_token",refresh_token:token.refresh_token}),cache:"no-store"
  });
  if(!response.ok)throw new Error("Google authorization expired. Disconnect and reconnect your account.");
  const updated=await response.json();
  token={...token,access_token:updated.access_token,expires_at:Date.now()+(updated.expires_in||3600)*1000};
  await saveToken(actor,workspace,provider,data.account,token);
 }
 return {token,account:data.account};
}
export async function googleFetch(token:Token,url:string,init:RequestInit={}):Promise<Response>{
 const response=await fetch(url,{...init,cache:"no-store",
 headers:{Authorization:"Bearer "+token.access_token,...init.headers}});
 if(!response.ok){
  // Do not include provider payloads, which can contain personal data, in errors or logs.
  throw new Error("Google API returned HTTP "+response.status+". Check the account authorization and permissions.");
 }
 return response;
}
function proposalOf(action:Action){
 const doc=action.document as {account?:string;proposal?:{subject?:string;body?:string;to?:string;start?:string;end?:string;fileId?:string;destinationId?:string}};
 if(!doc?.proposal)throw new Error("Approved action has no usable payload.");
 return doc;
}
export async function executeGoogleAction(actor:Actor,workspace:string,action:Action):Promise<{reference:string;detail:Record<string,unknown>}>{
 const provider=action.provider as Provider,doc=proposalOf(action);
 const {token,account}=await getToken(actor,workspace,provider);
 if(!doc.account||doc.account!==account)throw new Error("The connected account differs from the approved account.");
 const p=doc.proposal!;
 if(provider==="gmail"&&action.operation==="send"){
  if(!p.to||!p.subject||!p.body||/[\r\n]/.test(p.to))throw new Error("The approved email is incomplete.");
  const safeSubject=p.subject.replace(/[\r\n]/g," ");
  const encodedSubject="=?UTF-8?B?"+Buffer.from(safeSubject).toString("base64")+"?=";
  const raw=["To: "+p.to,"Subject: "+encodedSubject,"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64","",Buffer.from(p.body).toString("base64")].join("\r\n");
  const sent=await googleFetch(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({raw:Buffer.from(raw).toString("base64url")})
  });
  const result=await sent.json();
  if(!result.id)throw new Error("Gmail did not provide a message ID.");
  const verified=await googleFetch(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(result.id)+"?format=metadata");
  const message=await verified.json();
  if(message.id!==result.id)throw new Error("Gmail could not verify the sent message.");
  return {reference:result.id,detail:{type:"gmail_message",messageId:result.id,account}};
 }
 if(provider==="calendar"&&action.operation==="create_event"){
  if(!p.subject||!p.start||!p.end||!Number.isFinite(Date.parse(p.start))||!Number.isFinite(Date.parse(p.end))||
    Date.parse(p.end)<=Date.parse(p.start))throw new Error("The approved event needs valid start and end times.");
  const response=await googleFetch(token,"https://www.googleapis.com/calendar/v3/calendars/primary/events",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({summary:p.subject,description:p.body||"",start:{dateTime:p.start},end:{dateTime:p.end}})
  });
  const event=await response.json();
  if(!event.id)throw new Error("Google Calendar did not return an event ID.");
  const verified=await googleFetch(token,"https://www.googleapis.com/calendar/v3/calendars/primary/events/"+encodeURIComponent(event.id));
  const created=await verified.json();
  if(created.id!==event.id)throw new Error("The calendar event could not be verified.");
  return {reference:event.id,detail:{type:"calendar_event",eventId:event.id,account}};
 }
 if(provider==="drive"&&action.operation==="move_file"){
  if(!p.fileId||!p.destinationId)throw new Error("Choose an authorized file and destination.");
  const metadata=await googleFetch(token,"https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(p.fileId)+"?fields=id,parents,name");
  const old=await metadata.json();
  const params=new URLSearchParams({addParents:p.destinationId,removeParents:(old.parents||[]).join(","),fields:"id,parents,name"});
  const moved=await googleFetch(token,"https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(p.fileId)+"?"+params,{
    method:"PATCH",headers:{"Content-Type":"application/json"},body:"{}"
  });
  const result=await moved.json();
  const checked=await googleFetch(token,"https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(p.fileId)+"?fields=id,parents");
  const verified=await checked.json();
  if(result.id!==p.fileId||!verified.parents?.includes(p.destinationId))throw new Error("The Drive change was not verified.");
  return {reference:p.fileId,detail:{type:"drive_file",fileId:p.fileId,destinationId:p.destinationId,account}};
 }
 throw new Error("This provider operation has not been implemented.");
}
