"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowRight,CheckCircle2,LockKeyhole} from "lucide-react";
import {browserSupabase} from "@/lib/supabase-browser";
import {authDestination} from "@/lib/auth-destination";
import {Brand} from "../ui";
import "@/app/console/product.css";
type Mode="login"|"signup"|"forgot";
export default function Login(){
 const [mode,setMode]=useState<Mode>("login");
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [next,setNext]=useState("/console");
 useEffect(()=>{
  const q=new URLSearchParams(window.location.search);
  if(q.get("mode")==="signup")setMode("signup");
  setNext(authDestination(q.get("next")));
  if(q.get("error")==="verification")setError("This email link is invalid or expired. Open the latest link in the browser where you requested it.");
 },[]);
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError("");setSuccess("");
  try {
   const supabase=browserSupabase();
   if(mode==="forgot"){
    const {error:e}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+"/auth/callback?next=/auth/reset"});
    if(e)throw e;setSuccess("If that address is registered, check your email for a recovery link.");
   }else if(mode==="signup"){
    const {error:e,data}=await supabase.auth.signUp({email,password,
      options:{data:{name:name.trim()},emailRedirectTo:location.origin+"/auth/callback?next="+encodeURIComponent(next)}});
    if(e)throw e;
    if(data.session){location.assign(next);return;}
    setSuccess("Check your inbox to verify your email before signing in.");
   }else{
    const {error:e}=await supabase.auth.signInWithPassword({email,password});
    if(e)throw e;
    location.assign(next);return;
   }
  }catch(e){setError(e instanceof Error?e.message:"Could not finish this request.");}
  finally{setBusy(false);}
 }
 return <main className="bt-auth-shell" id="main-content">
   <div className="bt-auth-brand"><Brand />
     <Link href="/" className="bt-small-link">Back to website <ArrowRight size={14}/></Link>
   </div>
   <div className="bt-auth-grid">
    <div className="bt-auth-message">
     <span className="bt-eyebrow">HUMAN DECISIONS. VERIFIED ACTIONS.</span>
     <h1>Know what happens <em>before it happens.</em></h1>
     <p>Put people, policy and a permanent record between an AI proposal and a real-world action.</p>
     <div className="bt-auth-points">
      <div><CheckCircle2 size={18}/> Inspect the exact proposed change</div>
      <div><CheckCircle2 size={18}/> Collect approval from the right people</div>
      <div><CheckCircle2 size={18}/> Verify outcomes against real services</div>
     </div>
    </div>
    <section className="bt-auth-panel">
     <div className="bt-eyebrow">YOUR ACCOUNT</div>
     <h2>{mode==="login"?"Welcome back.":mode==="signup"?"Create an account.":"Reset your password."}</h2>
     <p>{mode==="login"?"Access your secure approval workspace.":mode==="signup"?"Start managing AI actions with oversight.":"We’ll email you a secure recovery link."}</p>
     {error&&<div role="alert" className="bt-alert">{error}</div>}
     {success&&<div role="status" className="bt-success">{success}</div>}
     <form onSubmit={submit} className="bt-form">
      {mode==="signup"&&<label>Full name<input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" autoComplete="name"/></label>}
      <label>Email address<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email"/></label>
      {mode!=="forgot"&&<label>Password<input required type="password" minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete={mode==="signup"?"new-password":"current-password"}/></label>}
      {mode==="login"&&<button className="bt-text-action" type="button" onClick={()=>{setMode("forgot");setError("");setSuccess("");}}>Forgot password?</button>}
      <button className="bt-primary bt-full" type="submit" disabled={busy}>{busy?"Working…":mode==="login"?"Sign in":mode==="signup"?"Create account":"Send recovery link"} <ArrowRight size={18}/></button>
     </form>
     <div className="bt-auth-switch">
      {mode==="login"?<>New here? <button onClick={()=>{setMode("signup");setError("");setSuccess("");}}>Create an account</button></>:
        <>Have an account? <button onClick={()=>{setMode("login");setError("");setSuccess("");}}>Sign in</button></>}
     </div>
     <div className="bt-auth-security"><LockKeyhole size={15}/> Your credentials are managed by Supabase Auth.</div>
    </section>
   </div>
 </main>;
}
