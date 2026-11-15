import {NextRequest,NextResponse} from "next/server";
import {authenticated} from "@/lib/btc-security";
import {googleAllowed,googleConfigured,hasGoogleScopes,isGoogleProvider,oauthRedirect,saveToken,type Provider} from "@/lib/google";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const redirect=new URL("/console?view=integrations",request.url);
 const actor=await authenticated();
 if(!actor)return NextResponse.redirect(new URL("/login",request.url));
 const raw=request.cookies.get("btc_oauth")?.value;
 const code=request.nextUrl.searchParams.get("code");
 const state=request.nextUrl.searchParams.get("state");
 let saved:{state:string;verifier:string;provider:Provider;workspace:string;user:string}|null=null;
 try{saved=raw?JSON.parse(raw):null}catch{ /* invalid callback */ }
 if(!saved?.verifier||!isGoogleProvider(saved.provider)||!state||state!==saved.state||saved.user!==actor.user.id||!googleConfigured()){
  redirect.searchParams.set("error","oauth-state");
  const r=NextResponse.redirect(redirect);r.cookies.delete("btc_oauth");return r;
 }
 redirect.searchParams.set("workspace",saved.workspace);
 if(request.nextUrl.searchParams.get("error")==="access_denied"){
  redirect.searchParams.set("error","Google permission was declined. Connect again when you’re ready.");
  const r=NextResponse.redirect(redirect);r.cookies.delete("btc_oauth");return r;
 }
 try{
  if(!await googleAllowed(actor,saved.workspace))throw new Error("Google connectors are limited to the private test workspace.");
  if(!code)throw new Error("Google did not return an authorization code. Connect again.");
  const response=await fetch("https://oauth2.googleapis.com/token",{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID||"",client_secret:process.env.GOOGLE_CLIENT_SECRET||"",
     redirect_uri:oauthRedirect(),grant_type:"authorization_code",code_verifier:saved.verifier}),cache:"no-store",signal:AbortSignal.timeout(9000)
  });
  if(!response.ok)throw new Error("Google did not authorize this connection.");
  const token=await response.json();
  if(!token.access_token||!token.refresh_token)throw new Error("Google did not grant offline access. Reconnect the account.");
  if(!hasGoogleScopes(saved.provider,token.scope))throw new Error("Grant all requested permissions for this connector and try again.");
  const info=await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{
   headers:{Authorization:"Bearer "+token.access_token},cache:"no-store",signal:AbortSignal.timeout(8000)
  });
  if(!info.ok)throw new Error("Google identity verification failed.");
  const profile=await info.json();
  if(typeof profile.email!=="string"||profile.verified_email!==true)throw new Error("An authenticated Google email is required.");
  await saveToken(actor,saved.workspace,saved.provider,profile.email,{
   access_token:token.access_token,refresh_token:token.refresh_token,
   scope:token.scope||"",token_type:token.token_type||"Bearer",
   expires_at:Date.now()+(token.expires_in||3600)*1000
  });
  redirect.searchParams.set("connected",saved.provider);
 }catch(e){
  redirect.searchParams.set("error",e instanceof Error?e.message.slice(0,100):"connection-failed");
 }
 const r=NextResponse.redirect(redirect);
 r.cookies.delete("btc_oauth");
 return r;
}
