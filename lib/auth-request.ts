import {RequestError} from "./http";

export function requireSameOrigin(request:Request){
  const origin=request.headers.get("origin");
  const expected=process.env.VERCEL_ENV==="production"&&process.env.APP_URL?new URL(process.env.APP_URL).origin:new URL(request.url).origin;
  if(!origin||origin!==expected)
    throw new RequestError(403,"This request must come from Before the Click.");
}
