import {redirect} from "next/navigation";
import {serverSupabase} from "@/lib/supabase-server";
import Console from "./product";
import "./product.css";
export const dynamic="force-dynamic";
export default async function ConsolePage({searchParams}:{searchParams:Promise<{view?:string}>}){
 const supabase=await serverSupabase();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user){
  const {view}=await searchParams;
  const requested=view?"/console?"+new URLSearchParams({view}):"/console";
  redirect(view?"/login?"+new URLSearchParams({next:requested}):"/login?next=/console");
 }
 return <Console userId={user.id} email={user.email||""}/>;
}
