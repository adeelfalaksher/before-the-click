import {NextResponse} from "next/server";
import {accountSchema} from "@/lib/account-fields";
import {digest,hashPassword,recoveryToken,sessionToken,verifyPassword} from "@/lib/account-crypto";
import {requireSameOrigin} from "@/lib/auth-request";
import {bridge,type Account} from "@/lib/data-bridge";
import {accountCookie,getSession} from "@/lib/server-account";
import {readJson,requestError,RequestError} from "@/lib/http";
import {limit} from "@/lib/store";

export const runtime="nodejs";

const respond=(body:unknown)=>NextResponse.json(body,{headers:{"Cache-Control":"private, no-store"}});
function setSession(response:NextResponse,session:string,maxAge=7*24*60*60){
  response.cookies.set(accountCookie,session,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge,path:"/"});
  return response;
}

export async function POST(request:Request){
  try{
    requireSameOrigin(request);
    const input=await readJson(request,accountSchema,4096);
    if(input.action==="logout"){
      const current=await getSession();
      if(current)await bridge("logout",{},current);
      return setSession(respond({ok:true}),"",0);
    }
    await limit(request,"account-"+input.action,input.action==="signup"?12:35);
    const session=sessionToken();
    const token=digest(session);
    if(input.action==="signup"){
      const recovery=recoveryToken();
      await bridge("signup",{username:input.username,name:input.name,passwordHash:await hashPassword(input.password),recoveryHash:digest(recovery),token});
      return setSession(respond({ok:true,recovery}),session);
    }
    if(input.action==="login"){
      const row=await bridge<{id:string;password_hash:string}|null>("login",{username:input.username});
      if(!await verifyPassword(input.password,row?.password_hash)||!row)
        throw new RequestError(401,"The username or password is incorrect.");
      await bridge("issue",{id:row.id,expectedHash:row.password_hash,token});
      return setSession(respond({ok:true}),session);
    }
    const recovery=recoveryToken();
    await bridge<Account>("reset",{username:input.username,previousRecovery:digest(input.recovery),
      passwordHash:await hashPassword(input.password),recoveryHash:digest(recovery),token});
    return setSession(respond({ok:true,recovery}),session);
  }catch(error){return requestError(error);}
}
