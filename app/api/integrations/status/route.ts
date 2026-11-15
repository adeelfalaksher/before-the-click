import { authenticated } from "@/lib/btc-security";
import { googleAllowed, googleConfigured, googlePrivateTesting } from "@/lib/google";
import { draftAvailability } from "@/lib/drafting";
import { reply } from "@/lib/http";
export async function GET(request:Request){
 const actor=await authenticated();
 if(!actor)return Response.json({error:"Unauthorized"},{status:401});
 const workspace=new URL(request.url).searchParams.get("workspace");
 return reply({google:googleConfigured()&&await googleAllowed(actor,workspace),googlePrivateTesting:googlePrivateTesting(),...draftAvailability()});
}
