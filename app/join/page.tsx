"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import "@/app/console/product.css";
export default function Join(){
 const [message,setMessage]=useState("Checking your invitation…"),[done,setDone]=useState(false);
 useEffect(()=>{
  let mounted=true;
  (async()=>{
   try {
    const token=new URLSearchParams(location.search).get("token");
    if(!token||!/^[0-9a-f]{64}$/.test(token))throw new Error("This invitation link is invalid.");
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
    const hex=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
    const response=await fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"btc_join",d:hex})});
    if(response.status===401){location.replace("/login?next="+encodeURIComponent(location.pathname+location.search));return;}
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||"Could not accept this invitation.");
    if(mounted){setDone(true);setMessage("Invitation accepted. The workspace is now available in your account.");}
   }catch(e){if(mounted)setMessage(e instanceof Error?e.message:"Could not accept this invitation.");}
  })();
  return()=>{mounted=false;};
 },[]);
 return <main className="bt-reset"><Link className="bt-wordmark" href="/">before the click</Link>
  <section className="bt-auth-panel"><div className="bt-eyebrow">WORKSPACE INVITATION</div><h1>{done?"You’re in.":"Join your team."}</h1>
   <p role="status">{message}</p><Link className="bt-primary" href="/console">Open workspace</Link>
  </section></main>;
}
