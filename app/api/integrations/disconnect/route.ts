import {z} from "zod";
import {authenticated,jsonError,signedOperation} from "@/lib/btc-security";
import {getToken,googleConfigured} from "@/lib/google";
export const runtime="nodejs";
const schema=z.object({workspace:z.string().uuid(),provider:z.enum(["gmail","calendar","drive"])});
export async function POST(request:Request){
 const actor=await authenticated();
 if(!actor)return Response.json({error:"Sign in first."},{status:401});
 try{
  const {workspace,provider}=schema.parse(await request.json());
  let revoked=false;
  if(googleConfigured()){
   try{
    const {token}=await getToken(actor,workspace,provider);
    const response=await fetch("https://oauth2.googleapis.com/revoke",{
     method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
     body:new URLSearchParams({token:token.refresh_token||token.access_token}),cache:"no-store"
    });
    revoked=response.ok;
   }catch{/* Remote revocation can fail; always remove local grant below. */}
  }
  const signed=signedOperation(actor.user.id,"connection",{intent:"delete",workspace,provider});
  const {error}=await actor.supabase.rpc("btc_connection",signed);
  if(error)throw error;
  return Response.json({disconnected:true,googleRevoked:revoked});
 }catch(e){return jsonError(e);}
}
