"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowRight,CheckCircle2,LockKeyhole} from "lucide-react";
import {authDestination} from "@/lib/auth-destination";
import {Brand} from "../ui";
import "@/app/console/product.css";
type Mode="login"|"signup"|"recovery";
export default function Login(){
 const [mode,setMode]=useState<Mode>("login");
 const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState("");
 const [recovery,setRecovery]=useState(""),[newCode,setNewCode]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [next,setNext]=useState("/console");
 useEffect(()=>{
  const q=new URLSearchParams(window.location.search);
  if(q.get("mode")==="signup")setMode("signup");
  if(q.get("mode")==="recovery")setMode("recovery");
  setNext(authDestination(q.get("next")));
 },[]);
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError("");setSuccess("");
  try {
   const payload=mode==="signup"?{action:"signup",username,password,name}:mode==="recovery"?
    {action:"reset",username,password,recovery}:{action:"login",username,password};
   const response=await fetch("/api/account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"Could not access your account.");
   if(result.recovery){if(!/^[a-f0-9]{48}$/.test(result.recovery))throw new Error("The recovery code was unavailable.");setNewCode(result.recovery);setPassword("");setRecovery("");return;}
   location.assign(next);
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
     {newCode?<div className="bt-form"><h2>Save your recovery code.</h2><p>Keep this code somewhere private. You’ll need it if you forget your password.</p><label>Recovery code<input readOnly value={newCode} onFocus={e=>e.currentTarget.select()}/></label><button className="bt-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(newCode);setSuccess("Code copied.");}catch{setSuccess("Select the code to copy it.");}}}>Copy recovery code</button>{success&&<p role="status">{success}</p>}<Link className="bt-primary" href={next}>I’ve saved it <ArrowRight size={18}/></Link></div>:<>
     <h2>{mode==="login"?"Welcome back.":mode==="signup"?"Create an account.":"Reset your password."}</h2>
     <p>{mode==="login"?"Access your secure approval workspace.":mode==="signup"?"Start managing AI actions with oversight.":"Enter the recovery code you saved when you created your account."}</p>
     {error&&<div role="alert" className="bt-alert">{error}</div>}
     {success&&<div role="status" className="bt-success">{success}</div>}
     <form onSubmit={submit} className="bt-form">
      {mode==="signup"&&<label>Full name<input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" autoComplete="name"/></label>}
      <label>Username<input required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_]{2,23}" value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. raouf_k" autoComplete="username" autoCapitalize="none"/></label>
      {mode==="signup"&&<small>Use 3–24 letters, numbers or underscores. Each username is unique.</small>}
      {mode==="recovery"&&<label>Recovery code<input required value={recovery} onChange={e=>setRecovery(e.target.value)} autoComplete="off" maxLength={48}/></label>}
      <label>{mode==="recovery"?"New password":"Password"}<input required type="password" minLength={mode==="login"?1:10} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==="login"?"Your password":"At least 10 characters"} autoComplete={mode==="login"?"current-password":"new-password"}/></label>
      {mode==="login"&&<button className="bt-text-action" type="button" onClick={()=>{setMode("recovery");setError("");setSuccess("");}}>Forgot password?</button>}
      <button className="bt-primary bt-full" type="submit" disabled={busy}>{busy?"Working…":mode==="login"?"Sign in":mode==="signup"?"Create account":"Reset password"} <ArrowRight size={18}/></button>
     </form>
     <div className="bt-auth-switch">
      {mode==="login"?<>New here? <button onClick={()=>{setMode("signup");setError("");setSuccess("");}}>Create an account</button></>:
        <>Have an account? <button onClick={()=>{setMode("login");setError("");setSuccess("");}}>Sign in</button></>}
     </div>
     <div className="bt-auth-security"><LockKeyhole size={15}/> Your username is tied to your private account.</div>
     </>}
    </section>
   </div>
 </main>;
}
