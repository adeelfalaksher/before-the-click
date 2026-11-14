import "server-only";
import {createHmac} from "node:crypto";
import {bridge} from "./data-bridge";
import {currentAccount,getSession} from "./server-account";
import {RequestError} from "./http";

export async function authenticated(){
  const session=await getSession();
  const user=await currentAccount();
  if(!session||!user)return null;
  return {user,data:<T>(action:string,input?:Record<string,unknown>)=>bridge<T>(action,input,session)};
}

export function signedOperation(userId:string,kind:"proposal"|"connection"|"execution"|"publish",data:unknown){
  const secret=process.env.BTC_SERVER_SECRET;
  if(!secret)throw new Error("Workflow signing is not configured on the server.");
  const payload=JSON.stringify(data);
  return {payload,signature:createHmac("sha256",secret).update(userId+":"+kind+":"+payload).digest("hex")};
}

export function jsonError(error:unknown,fallback="The request could not be completed."){
  const raw=error instanceof Error?error.message:fallback;
  const detail=raw.toLowerCase().includes("secret")?"Server configuration is incomplete.":raw;
  return Response.json({error:detail},{status:error instanceof RequestError?error.status:400});
}
