import {NextRequest,NextResponse} from "next/server";
import {authDestination} from "@/lib/auth-destination";

export function GET(request:NextRequest){
  const redirect=new URL("/login",request.url);
  redirect.searchParams.set("next",authDestination(request.nextUrl.searchParams.get("next")));
  return NextResponse.redirect(redirect);
}
