import {createHash,randomBytes,scrypt,timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";

const derive=promisify(scrypt);
const emptyHash="00000000000000000000000000000000:"+("0".repeat(128));

export const digest=(token:string)=>createHash("sha256").update(token).digest("hex");
export const sessionToken=()=>randomBytes(32).toString("hex");
export const recoveryToken=()=>randomBytes(24).toString("hex");

export async function hashPassword(password:string){
  const salt=randomBytes(16).toString("hex");
  return salt+":"+(await derive(password,salt,64) as Buffer).toString("hex");
}

export async function verifyPassword(password:string,stored?:string){
  const [salt,hash]=(stored||emptyHash).split(":");
  const expected=Buffer.from(hash,"hex");
  const actual=await derive(password,salt,64) as Buffer;
  return expected.length===actual.length&&timingSafeEqual(expected,actual)&&Boolean(stored);
}
