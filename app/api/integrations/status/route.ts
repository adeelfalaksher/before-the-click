import { authenticated } from "@/lib/btc-security";
import { googleConfigured } from "@/lib/google";
export async function GET(){
 const actor=await authenticated();
 if(!actor)return Response.json({error:"Unauthorized"},{status:401});
 return Response.json({google:googleConfigured(),gemini:Boolean(process.env.GEMINI_API_KEY)});
}
