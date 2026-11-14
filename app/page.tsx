import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, FolderOpen, Inbox, ShieldCheck, Waypoints } from "lucide-react";
import { Brand, SiteFooter } from "./ui";

const steps = [
  { name: "Describe the task", detail: "Start with a sample or bring your own records.", icon: Inbox },
  { name: "Review in order", detail: "Decide what should go ahead and what needs work.", icon: ShieldCheck },
  { name: "See what changes", detail: "Run the plan and compare the before and after.", icon: Waypoints }
];
const previewReviewers = [
  { initials: "MP", name: "Maya Patel", role: "Product", status: "Approved", tone: "green" },
  { initials: "AJ", name: "Amir Javed", role: "Operations", status: "Awaiting review", tone: "amber" },
  { initials: "CL", name: "Claire Liu", role: "Privacy", status: "Waiting", tone: "neutral" }
];

export default function Home() {
  return <>
    <main id="main-content">
      <div className="hero-stage">
        <div className="hero-shell">
          <header className="site-header">
            <Brand />
            <nav aria-label="Main navigation">
              <a href="#workflow">Workflow</a>
              <Link href="/workspace?view=map">Simulator</Link>
              <Link href="/workspace?view=review">Approvals</Link>
              <Link href="/guide">Field guide</Link>
            </nav>
            <Link className="button dark header-cta" href="/workspace">Open workspace <ArrowUpRight size={15} /></Link>
          </header>
          <div className="hero-visual">
            <div className="hero-art"><Image src="/architecture.webp" alt="" width={1320} height={880} priority unoptimized /></div>
            <div className="hero-note left"><span>AGENT REHEARSAL</span><p>For decisions worth a second look.</p><a href="#workflow">See how it works <ArrowDownRight size={13} /></a></div>
            <div className="hero-note right"><span>WORKSPACE</span><p>Plan the action.<br />Review the decision.<br />Test the outcome.</p></div>
          </div>
          <div className="hero-content">
            <h1>Before an agent acts,<br /><em>see what happens.</em></h1>
            <p>Review what an AI agent plans to do, get the right people to sign off, and test the outcome in a sandbox.</p>
            <div className="hero-actions">
              <Link className="button dark" href="/workspace">Start a rehearsal <ArrowRight size={18} /></Link>
              <a className="text-link" href="#workflow">Explore the workflow <ArrowDownRight size={16} /></a>
            </div>
          </div>
          <span className="register r-top-left" aria-hidden="true">+</span><span className="register r-top-right" aria-hidden="true">+</span>
          <span className="register r-bottom-left" aria-hidden="true">+</span><span className="register r-bottom-right" aria-hidden="true">+</span>
        </div>
      </div>

      <section id="workflow" className="home-workflow page-width" aria-labelledby="workflow-title">
        <div className="section-kicker">THE WORKFLOW</div>
        <h2 id="workflow-title">A clear path from request to decision.</h2>
        <div className="home-steps">
          {steps.map(({ name, detail, icon: Icon }, index) => <div key={name}>
            <div className="step-top"><Icon size={21} strokeWidth={1.65} /><span>0{index + 1}</span></div>
            <h3>{name}</h3><p>{detail}</p>
          </div>)}
        </div>
      </section>

      <section className="product-story page-width" aria-label="Inside the workspace">
        <article className="story-row">
          <div className="story-text">
            <div className="section-kicker">APPROVAL QUEUE</div>
            <h2>Give everyone their turn.</h2>
            <p>Set the review order and give each person a clear brief. See who approved, who’s up next, and what needs a change.</p>
            <Link href="/workspace?view=review" className="text-link">Explore approvals <ArrowUpRight size={16} /></Link>
          </div>
          <div className="preview-approvals" aria-label="Example approval sequence">
            <div className="preview-paper">
              <div className="preview-heading"><Clock3 size={19} /><strong>Operations is up next</strong></div>
              <p>1 of 3 approvals complete</p>
              <div className="preview-rule">Review in order</div>
              {previewReviewers.map(person => <div className="preview-person" key={person.name}>
                <span className={"avatar " + person.tone}>{person.initials}</span>
                <span><b>{person.name}</b><small>{person.role}</small></span>
                <span className={"status-tag " + person.tone}>{person.status} {person.tone === "green" && <Check size={12} />}</span>
              </div>)}
            </div>
          </div>
        </article>
        <article className="story-row reverse">
          <div className="story-text">
            <div className="section-kicker">SIMULATOR MAP</div>
            <h2>See where each action lands.</h2>
            <p>Open a map marker to see the source, the proposed action, and the rule that could block it. Once approved, compare the outcome with the starting state.</p>
            <Link href="/workspace?view=map" className="text-link">Open the simulator <ArrowUpRight size={16} /></Link>
          </div>
          <Link href="/workspace?view=map" aria-label="Open the interactive simulator map" className="preview-map">
            <Image src="/campus.webp" width={1400} height={933} alt="" unoptimized />
            <span className="sample-pin p1">1</span><span className="sample-pin p2">2</span><span className="sample-pin p3">3</span>
            <span className="sample-map-label"><FolderOpen size={17} /> Action map <ChevronRight size={15} /></span>
          </Link>
        </article>
      </section>

      <section className="home-end">
        <div className="page-width">
          <div><div className="section-kicker">YOUR FIRST REHEARSAL</div><h2>Start with a familiar task.</h2><p>Try a launch-week inbox, a calendar clash, or a shared folder.</p></div>
          <Link className="button dark" href="/workspace?new=1">Choose a scenario <ArrowRight size={17} /></Link>
        </div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
