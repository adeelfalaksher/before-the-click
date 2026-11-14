import {NextRequest,NextResponse} from "next/server";
import {serverSupabase} from "@/lib/supabase-server";
import {authDestination} from "@/lib/auth-destination";
export async function GET(request:NextRequest){
 const url=new URL(request.url);
 const code=url.searchParams.get("code");
 const destination=authDestination(url.searchParams.get("next"));
 if(code){
  const supabase=await serverSupabase();
  const {error}=await supabase.auth.exchangeCodeForSession(code);
  if(!error)return NextResponse.redirect(new URL(destination,url.origin));
 }
 return NextResponse.redirect(new URL("/login?error=verification",url.origin));
}
