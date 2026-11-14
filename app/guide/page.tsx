import type {Metadata} from "next";
import Link from "next/link";
import {ArrowRight} from "lucide-react";
import {Brand,SiteFooter} from "../ui";

export const metadata:Metadata={title:"Field guide"};
const sections=[
 ["1. Create your workspace","Sign up with a username and password, save your recovery code, then select Create your workspace."],
 ["2. Propose a team update","Select New workflow and choose Save a workspace record. Describe your goal and enter the record title and text. Draft with AI is optional. Check the proposed content before submitting it."],
 ["3. Choose who reviews","Select yourself for a solo run if your workspace allows self-approval. For team review, go to Team, create an invitation for a colleague’s existing username, and share the link. Once they accept, select your reviewers in the order they should decide."],
 ["4. Approve the proposal","In Approvals, the next reviewer can approve, request changes, or reject. Any revision starts a new review. Use Policies to control self-approval and external actions."],
 ["5. Run the approved action","Return to the workflow after all required reviews and select Execute action. The workflow owner confirms the exact change before it runs."],
 ["6. Check the result","Open Saved records to read your published update and Audit log to inspect the decisions and execution receipt. Use the Simulator map to see the action’s current stage."],
 ["Working with Google accounts","When Google connections are available, use Integrations to connect Gmail for approved messages, Calendar for new events on your primary calendar, or Drive to move files the app has permission to access. If a result needs verification, check it in Google before trying again."]
];
export default function Guide(){
 return <>
  <header className="simple-header"><Brand /><Link href="/console" className="button dark">Open workspace <ArrowRight size={16}/></Link></header>
  <main id="main-content" className="guide-main page-width">
   <span className="section-kicker">FIELD GUIDE</span><h1>Every action, from proposal to proof.</h1>
   <p className="lede">Follow a team update from a first draft to an approved workspace record. This example uses data you enter in your workspace.</p>
   <Link href="/console?view=workflows" className="button dark">Open workflows <ArrowRight size={16}/></Link>
   <div className="guide-questions">{sections.map(([title,body],index)=><details key={title} open={index===0}><summary>{title}</summary><p>{body}</p></details>)}</div>
  </main>
  <SiteFooter />
 </>;
}
