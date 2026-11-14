import "server-only";
import {cache} from "react";
import {cookies} from "next/headers";
import {bridge,type Account} from "./data-bridge";

export const accountCookie="btc_session";

export const getSession=cache(async()=>{
  const cookie=(await cookies()).get(accountCookie)?.value;
  return cookie&&/^[0-9a-f]{64}$/.test(cookie)?cookie:undefined;
});

export const currentAccount=cache(async()=>{
  const session=await getSession();
  if(!session)return null;
  return bridge<Account|null>("session",{},session);
});
