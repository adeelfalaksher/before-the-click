"use client";
import {useState} from "react";
import Link from "next/link";
import {browserSupabase} from "@/lib/supabase-browser";
import "@/app/console/product.css";
export default function Reset(){
 const [password,setPassword]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setStatus("");
  try{const {error}=await browserSupabase().auth.updateUser({password});if(error)throw error;
   setStatus("Password changed. You can now sign in.");
  }catch(e){setStatus(e instanceof Error?e.message:"Recovery session is missing or expired.");}
  finally{setBusy(false);}
 }
 return <main className="bt-reset"><Link className="bt-wordmark" href="/">before the click</Link>
   <section className="bt-auth-panel"><div className="bt-eyebrow">ACCOUNT RECOVERY</div><h1>Choose a new password.</h1>
    <form className="bt-form" onSubmit={submit}><label>New password<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
     <button className="bt-primary" disabled={busy}>Update password</button></form>
    {status&&<p role="status">{status}</p>}<Link href="/login" className="bt-small-link">Return to sign in</Link>
   </section>
 </main>;
}
