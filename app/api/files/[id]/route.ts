import {z} from "zod";
import {bridge} from "@/lib/data-bridge";
import {getSession} from "@/lib/server-account";
import {reply,requestError,RequestError} from "@/lib/http";

export const runtime="nodejs";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const session=await getSession();
    if(!session)return reply({error:"Sign in first."},401);
    const id=z.string().uuid().safeParse((await params).id);
    if(!id.success)return reply({error:"File not found."},404);
    const file=await bridge<{signedPath:string;filename:string}>("file_read",{id:id.data},session);
    if(!file.signedPath.startsWith("/object/sign/btc-workspace-files/"))throw new RequestError(503,"File storage is unavailable.");
    const upstream=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/storage/v1"+file.signedPath,{
      cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20_000)
    });
    if(!upstream.ok||!upstream.body)throw new RequestError(404,"File not found.");
    const encoded=encodeURIComponent(file.filename).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16));
    return new Response(upstream.body,{headers:{
      "Content-Type":"application/octet-stream",
      "Content-Disposition":"attachment; filename*=UTF-8''"+encoded,
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff"
    }});
  }catch(error){return requestError(error);}
}
