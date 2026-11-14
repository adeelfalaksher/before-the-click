import {redirect} from "next/navigation";
import {serverSupabase} from "@/lib/supabase-server";
import Console from "./product";
import "./product.css";
export const dynamic="force-dynamic";
export default async function ConsolePage(){
 const supabase=await serverSupabase();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect("/login?next=/console");
 return <Console userId={user.id} email={user.email||""}/>;
}
