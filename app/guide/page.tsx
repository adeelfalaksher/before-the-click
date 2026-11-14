import Link from "next/link";
import {ArrowRight,CheckCircle2,ShieldCheck} from "lucide-react";
import "../console/product.css";
const sections=[
 ["1. Start securely","Register an account and verify your email. Create a workspace that will contain members, policies, actions and audit history."],
 ["2. Create a proposal","Choose an action, describe the desired result and write its exact content. Gemini can prepare a draft, which must be reviewed and edited by a person."],
 ["3. Choose reviewers","Assign authorized workspace members to an ordered approval queue. Each approval applies only to the current immutable workflow version."],
 ["4. Apply workspace policies","Administrators control permitted external actions and whether a workflow owner can self-approve. Server rules apply to the final execution, not just the interface."],
 ["5. Execute only after approval","Once all reviewers approve, the workflow owner explicitly submits the operation. The application checks the current account, permission and policy before execution."],
 ["6. Verify the outcome","Successful workspace actions create persistent records. Connected providers return operation identifiers, which the application checks before reporting completion."],
 ["7. Review the audit trail","Inspect creation, approval, denial and execution events in the workspace ledger. An uncertain external result must be investigated rather than blindly repeated."]
];
export default function Guide(){
 return <main className="bt-marketing" id="main-content">
  <header className="bt-landing-header"><Link href="/" className="bt-wordmark"><span className="bt-symbol">b<span>.</span></span>before the click</Link>
   <nav className="bt-landing-nav"><Link href="/">Home</Link></nav><Link href="/console" className="bt-primary">Open workspace <ArrowRight size={16}/></Link></header>
  <section className="bt-proof-section" style={{maxWidth:1100,margin:"auto"}}>
   <span className="bt-eyebrow">PRODUCT FIELD GUIDE</span><h1 style={{fontFamily:"Instrument Serif, Georgia, serif",fontSize:"clamp(50px,6vw,78px)",fontWeight:400,maxWidth:790,margin:"20px 0"}}>Every action, from proposal to proof.</h1>
   <p style={{fontSize:16,maxWidth:700,marginBottom:40}}>Before the Click provides an approval and execution boundary for work assisted by AI. AI writes drafts; human reviewers authorize the exact action; the server verifies what really happened.</p>
   {sections.map(([title,body])=><article key={title} style={{display:"grid",gridTemplateColumns:"minmax(0,240px) 1fr",gap:25,padding:"22px 0",borderTop:"1px solid #e3e7ed"}}>
    <h2 style={{fontFamily:"DM Sans Variable,Arial,sans-serif",fontSize:17,fontWeight:700,margin:0}}>{title}</h2><p>{body}</p></article>)}
   <p style={{marginTop:25}}>External Google services require OAuth authorization. Access to particular Gmail and Drive permissions may require Google verification. An unavailable integration must never appear connected.</p>
   <Link href="/console" className="bt-primary" style={{marginTop:24}}>Manage your actions <ArrowRight size={16}/></Link>
  </section>
 </main>;
}
