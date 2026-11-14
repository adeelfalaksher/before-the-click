import Link from "next/link";
import {ArrowRight,ArrowUpRight,FileText,GitCompareArrows,ShieldCheck} from "lucide-react";
import {ActionPreview} from "./action-preview";
import "./console/product.css";
const stages=[
 {n:"01",title:"Prepare",body:"Create a precise, inspectable proposal. AI can help draft it, but cannot execute it."},
 {n:"02",title:"Inspect",body:"See the intended account, exact content and consequences before deciding."},
 {n:"03",title:"Approve",body:"Every reviewer signs off on the same immutable version of the action."},
 {n:"04",title:"Execute",body:"The server checks policy and authorization before calling the external service."},
 {n:"05",title:"Verify",body:"The outcome is verified, recorded and traceable to its decision."}
];
export default function Home(){
 return <main id="main-content" className="bt-marketing">
  <header className="bt-landing-header">
   <Link href="/" className="bt-wordmark"><span className="bt-symbol">b<span>.</span></span>before the click</Link>
   <nav className="bt-landing-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#control">The controls</a><Link href="/guide">Documentation</Link></nav>
   <div className="bt-landing-header-actions"><Link className="bt-small-link" href="/login">Sign in</Link><Link href="/login?mode=signup" className="bt-primary">Get started <ArrowUpRight size={15}/></Link></div>
  </header>
  <section className="bt-landing-hero" aria-labelledby="hero-heading">
   <div><span className="bt-eyebrow">THE APPROVAL LAYER FOR AI-POWERED WORK</span>
    <h1 id="hero-heading">Give every action <em>a second look.</em></h1>
    <p className="bt-deck">An AI agent can propose a change. Before the Click makes sure the right people inspect it, policies permit it, and the final result is verified.</p>
    <div className="bt-hero-ctas"><Link className="bt-primary" href="/login?mode=signup">Create a workspace <ArrowRight size={17}/></Link><a className="bt-small-link" href="#how-it-works">Explore the process <ArrowRight size={15}/></a></div>
    <div className="bt-hero-proof"><span><strong>01 / HUMAN REVIEW</strong>No invisible decisions</span><span><strong>02 / POLICY GATES</strong>Permissions before execution</span><span><strong>03 / AUDIT TRAIL</strong>Every outcome accounted for</span></div>
   </div>
   <ActionPreview />
  </section>
  <section id="control" className="bt-features"><span className="bt-eyebrow">THE SAFETY NET IS THE PRODUCT</span><h2>Control isn’t a checklist.<br/>It’s the architecture.</h2>
   <div className="bt-feature-grid">
    <div><GitCompareArrows size={25} strokeWidth={1.5}/><h3>Inspect the exact change</h3><p>Readable proposals show what is affected, which account is used and what action will occur.</p></div>
    <div><ShieldCheck size={25} strokeWidth={1.5}/><h3>Rules that cannot be waved away</h3><p>Workspace policy is checked by the server again when execution is requested.</p></div>
    <div><FileText size={25} strokeWidth={1.5}/><h3>A verifiable history</h3><p>Track approval decisions, attempted operations and confirmed outcomes in one place.</p></div>
   </div>
  </section>
  <section className="bt-proof-section" id="how-it-works"><span className="bt-eyebrow">FROM INTENT TO EVIDENCE</span>
   <h2>A clear line between thinking and doing.</h2><p>Let an agent assist with preparation while people retain final authority. Start with workspace records; connect supported accounts using their official authorization process.</p>
   <div className="bt-proof-flow">{stages.map(s=><div key={s.n}><span>{s.n} / 05</span><strong>{s.title}</strong><p>{s.body}</p></div>)}</div>
  </section>
  <footer className="bt-landing-footer"><div><Link href="/" className="bt-wordmark"><span className="bt-symbol">b<span>.</span></span>before the click</Link><p>Built for actions worth checking.</p></div>
   <div><Link href="/login">Sign in</Link><span style={{margin:"0 14px",color:"#687787"}}>·</span><Link href="/guide">Field guide</Link></div>
  </footer>
 </main>;
}
