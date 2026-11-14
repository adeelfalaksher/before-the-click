import { authenticated } from "@/lib/btc-security";
import { googleConfigured } from "@/lib/google";
import { draftAvailability } from "@/lib/drafting";
export async function GET(){
 const actor=await authenticated();
 if(!actor)return Response.json({error:"Unauthorized"},{status:401});
 return Response.json({google:googleConfigured(),...draftAvailability()});
}
