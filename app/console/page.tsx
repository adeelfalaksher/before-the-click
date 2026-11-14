import {redirect} from "next/navigation";
import {currentAccount} from "@/lib/server-account";
import Console from "./product";
import "./product.css";
export const dynamic="force-dynamic";
export default async function ConsolePage({searchParams}:{searchParams:Promise<{view?:string}>}){
 const user=await currentAccount();
 if(!user){
  const {view}=await searchParams;
  const requested=view?"/console?"+new URLSearchParams({view}):"/console";
  redirect(view?"/login?"+new URLSearchParams({next:requested}):"/login?next=/console");
 }
 return <Console userId={user.id} username={user.username}/>;
}
