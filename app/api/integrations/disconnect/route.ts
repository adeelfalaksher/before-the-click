import {requireSameOrigin} from "@/lib/auth-request";
import {z} from "zod";
import {authenticated,jsonError,signedOperation} from "@/lib/btc-security";
import {getToken,googleConfigured} from "@/lib/google";
export const runtime="nodejs";
const schema=z.object({workspace:z.string().uuid(),provider:z.enum(["gmail","calendar","drive"])});
export async function POST(request:Request){
  try { requireSameOrigin(request); } catch { return Response.json({error:"This request must come from Before the Click."},{status:403}); }
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
  await actor.data("btc_connection",signed);
  return Response.json({disconnected:true,googleRevoked:revoked});
 }catch(e){return jsonError(e);}
}
