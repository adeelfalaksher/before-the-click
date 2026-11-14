import "server-only";
import {createHmac} from "node:crypto";
import {RequestError} from "./http";

export type Account={id:string;username:string;name:string};

export async function bridge<T>(action:string,input:Record<string,unknown>={},session?:string):Promise<T>{
  const origin=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret=process.env.BTC_SERVER_SECRET;
  if(!origin||!key||!secret)throw new RequestError(503,"Account storage is unavailable.");
  const body=JSON.stringify({action,input,session,expires:Date.now()+25_000});
  const signature=createHmac("sha256",secret).update("btc-data:"+body).digest("hex");
  const response=await fetch(origin+"/functions/v1/btc-data",{
    method:"POST",headers:{"Content-Type":"application/json",apikey:key,"x-btc-signature":signature},body,cache:"no-store",signal:AbortSignal.timeout(18_000)
  });
  const result=await response.json();
  if(!response.ok)throw new RequestError(response.status,result?.message||"Account storage is unavailable.");
  return result as T;
}
