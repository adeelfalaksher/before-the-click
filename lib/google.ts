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
const providerTimeout=8_000;
export function oauthScopes(p:Provider){return ["openid","email",...scopes[p]];}
export function hasGoogleScopes(provider:Provider,granted:unknown){
 if(typeof granted!=="string")return false;
 const available=new Set(granted.split(/\s+/));
 return scopes[provider].every(scope=>available.has(scope));
}
export function isGoogleProvider(value:unknown):value is Provider{
 return value==="gmail"||value==="calendar"||value==="drive";
}
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
 if(!hasGoogleScopes(provider,token.scope))throw new Error("Reconnect this Google account and grant the requested permissions.");
 if(token.expires_at<Date.now()+1000*90){
  if(!token.refresh_token)throw new Error("Google authorization has expired. Reconnect the account.");
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||"",client_secret:process.env.GOOGLE_CLIENT_SECRET||"",
      grant_type:"refresh_token",refresh_token:token.refresh_token}),cache:"no-store",signal:AbortSignal.timeout(providerTimeout)
  });
  if(!response.ok)throw new Error("Google authorization expired. Disconnect and reconnect your account.");
  const updated=await response.json();
  if(typeof updated.access_token!=="string"||!updated.access_token)throw new Error("Google did not return a usable access token.");
  const scope=updated.scope??token.scope;
  if(!hasGoogleScopes(provider,scope))throw new Error("Reconnect this Google account and grant the requested permissions.");
  token={...token,scope,access_token:updated.access_token,expires_at:Date.now()+(updated.expires_in||3600)*1000};
  await saveToken(actor,workspace,provider,data.account,token);
 }
 return {token,account:data.account};
}
export async function googleFetch(token:Token,url:string,init:RequestInit={}):Promise<Response>{
 const response=await fetch(url,{...init,cache:"no-store",signal:init.signal??AbortSignal.timeout(providerTimeout),
 headers:{Authorization:"Bearer "+token.access_token,...init.headers}});
 if(!response.ok){
  // Do not include provider payloads, which can contain personal data, in errors or logs.
  throw new Error("Google API returned HTTP "+response.status+". Check the account authorization and permissions.");
 }
 return response;
}

export class GoogleVerificationError extends Error{
 constructor(message:string,readonly reference:string,readonly detail:Record<string,unknown>){
  super(message);
  this.name="GoogleVerificationError";
 }
}

async function verifyGoogleResult(reference:string,detail:Record<string,unknown>,message:string,verify:()=>Promise<boolean>){
 try{
  if(await verify())return {reference,detail};
 }catch{/* The write returned an ID, but its result could not be independently checked. */}
 throw new GoogleVerificationError(message,reference,detail);
}
function proposalOf(action:Action){
 const doc=action.document as {account?:string;proposal?:{subject?:string;body?:string;to?:string;start?:string;end?:string;fileId?:string;destinationId?:string}};
 if(!doc?.proposal)throw new Error("Approved action has no usable payload.");
 return doc;
}

function mimeSubject(subject:string){
 const words:string[]=[];
 let part="";
 for(const char of subject.replace(/[\r\n]/g," ")){
  if(Buffer.byteLength(part+char)>45){words.push(part);part="";}
  part+=char;
 }
 if(part)words.push(part);
 return words.map(word=>"=?UTF-8?B?"+Buffer.from(word).toString("base64")+"?=").join("\r\n ");
}

export async function executeGoogleAction(actor:Actor,workspace:string,action:Action):Promise<{reference:string;detail:Record<string,unknown>}>{
 const provider=action.provider as Provider,doc=proposalOf(action);
 const {token,account}=await getToken(actor,workspace,provider);
 if(!doc.account||doc.account!==account)throw new Error("The connected account differs from the approved account.");
 const p=doc.proposal!;
 if(provider==="gmail"&&action.operation==="send"){
  if(!p.to||!p.subject||!p.body||/[\r\n]/.test(p.to))throw new Error("The approved email is incomplete.");
  const encodedBody=Buffer.from(p.body).toString("base64").match(/.{1,76}/g)?.join("\r\n")||"";
  const raw=["To: "+p.to,"Subject: "+mimeSubject(p.subject),"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64","",encodedBody].join("\r\n");
  const sent=await googleFetch(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({raw:Buffer.from(raw).toString("base64url")})
  });
  const result=await sent.json();
  if(typeof result.id!=="string"||!result.id)throw new Error("Gmail did not provide a message ID.");
  const messageId=result.id;
  return verifyGoogleResult(messageId,{type:"gmail_message",messageId,account},"Gmail could not verify the sent message.",async()=>{
   const verified=await googleFetch(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(messageId)+"?format=metadata");
   const message=await verified.json();
   return message.id===messageId&&Array.isArray(message.labelIds)&&message.labelIds.includes("SENT");
  });
 }
 if(provider==="calendar"&&action.operation==="create_event"){
  if(!p.subject||!p.start||!p.end||!Number.isFinite(Date.parse(p.start))||!Number.isFinite(Date.parse(p.end))||
    Date.parse(p.end)<=Date.parse(p.start))throw new Error("The approved event needs valid start and end times.");
  const response=await googleFetch(token,"https://www.googleapis.com/calendar/v3/calendars/primary/events",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({summary:p.subject,description:p.body||"",start:{dateTime:p.start},end:{dateTime:p.end}})
  });
  const event=await response.json();
  if(typeof event.id!=="string"||!event.id)throw new Error("Google Calendar did not return an event ID.");
  const eventId=event.id;
  return verifyGoogleResult(eventId,{type:"calendar_event",eventId,account},"The calendar event could not be verified.",async()=>{
   const verified=await googleFetch(token,"https://www.googleapis.com/calendar/v3/calendars/primary/events/"+encodeURIComponent(eventId));
   const created=await verified.json();
   return created.id===eventId&&created.status!=="cancelled"&&created.summary===p.subject&&
    Date.parse(created.start?.dateTime)===Date.parse(p.start!)&&Date.parse(created.end?.dateTime)===Date.parse(p.end!);
  });
 }
 if(provider==="drive"&&action.operation==="move_file"){
  if(!p.fileId||!p.destinationId)throw new Error("Choose an authorized file and destination.");
  const {fileId,destinationId}=p;
  const detail={type:"drive_file",fileId,destinationId,account};
  const driveBase="https://www.googleapis.com/drive/v3/files/";
  const [metadata,destination]=await Promise.all([
   googleFetch(token,driveBase+encodeURIComponent(fileId)+"?fields=id,parents,mimeType,trashed"),
   googleFetch(token,driveBase+encodeURIComponent(destinationId)+"?fields=id,mimeType,trashed,capabilities(canAddChildren)")
  ]);
  const [old,folder]=await Promise.all([metadata.json(),destination.json()]);
  const folderMime="application/vnd.google-apps.folder";
  if(old.id!==fileId||old.trashed||old.mimeType===folderMime)throw new Error("The approved Drive item is no longer an accessible file.");
  if(folder.id!==destinationId||folder.trashed||folder.mimeType!==folderMime||folder.capabilities?.canAddChildren!==true)
   throw new Error("The approved destination no longer accepts files.");
  const parents:string[]=Array.isArray(old.parents)?old.parents:[];
  if(parents.includes(destinationId))return {reference:fileId,detail:{...detail,alreadyInDestination:true}};
  const params=new URLSearchParams({addParents:destinationId,fields:"id"});
  if(parents.length)params.set("removeParents",parents.join(","));
  const moved=await googleFetch(token,driveBase+encodeURIComponent(fileId)+"?"+params,{
    method:"PATCH",headers:{"Content-Type":"application/json"},body:"{}"
  });
  return verifyGoogleResult(fileId,detail,"The Drive change could not be verified.",async()=>{
   if((await moved.json()).id!==fileId)return false;
   const checked=await googleFetch(token,driveBase+encodeURIComponent(fileId)+"?fields=id,parents");
   const verified=await checked.json();
   return verified.id===fileId&&Array.isArray(verified.parents)&&verified.parents.includes(destinationId);
  });
 }
 throw new Error("This provider operation has not been implemented.");
}
