import {createHash,randomBytes} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {authenticated} from "@/lib/btc-security";
import {googleConfigured,oauthRedirect,oauthScopes,type Provider} from "@/lib/google";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const actor=await authenticated();
 if(!actor)return NextResponse.redirect(new URL("/login",request.url));
 if(!googleConfigured())return NextResponse.redirect(new URL("/console?error=google-config",request.url));
 const provider=request.nextUrl.searchParams.get("provider");
 const workspace=request.nextUrl.searchParams.get("workspace");
 if(provider!=="gmail"&&provider!=="calendar"&&provider!=="drive")return Response.json({error:"Invalid provider."},{status:400});
 if(!workspace||!/^[0-9a-f-]{36}$/i.test(workspace))return Response.json({error:"Invalid workspace."},{status:400});
 const {data:member}=await actor.supabase.from("workspace_members").select("role").eq("workspace_id",workspace).eq("user_id",actor.user.id).maybeSingle();
 if(!member)return Response.json({error:"Workspace access required."},{status:403});
 const state=randomBytes(24).toString("hex");
 const verifier=randomBytes(32).toString("base64url");
 const response=NextResponse.redirect("https://accounts.google.com/o/oauth2/v2/auth?"+new URLSearchParams({
  client_id:process.env.GOOGLE_CLIENT_ID||"",redirect_uri:oauthRedirect(),response_type:"code",
  access_type:"offline",prompt:"consent",scope:oauthScopes(provider as Provider).join(" "),state,
  code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"
 }));
 response.cookies.set("btc_oauth",JSON.stringify({state,verifier,provider,workspace,user:actor.user.id}),{
   httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:600
 });
 return response;
}
