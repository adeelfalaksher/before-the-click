import type {Metadata} from "next";
import Link from "next/link";
import {ArrowRight} from "lucide-react";
import {Brand,SiteFooter} from "../ui";

export const metadata:Metadata={title:"Field guide"};
const sections=[
 ["1. Start securely","Choose a unique username and password. Save your recovery code, then create a workspace for your actions and decisions."],
 ["2. Create a proposal","Choose an action, describe the desired result and write its exact content. Gemini can prepare a draft, which must be reviewed and edited by a person."],
 ["3. Choose reviewers","Assign authorized workspace members to an ordered approval queue. Each approval applies only to the current immutable workflow version."],
 ["4. Apply workspace policies","Administrators control permitted external actions and whether a workflow owner can self-approve. Server rules apply to the final execution, not just the interface."],
 ["5. Execute only after approval","Once all reviewers approve, the workflow owner explicitly submits the operation. The application checks the current account, permission and policy before execution."],
 ["6. Verify the outcome","Successful workspace actions create persistent records. Connected providers return operation identifiers, which the application checks before reporting completion."],
 ["7. Review the audit trail","Inspect creation, approval, denial and execution events in the workspace ledger. An uncertain external result must be investigated rather than blindly repeated."]
];
export default function Guide(){
 return <>
  <header className="simple-header"><Brand /><Link href="/console" className="button dark">Open workspace <ArrowRight size={16}/></Link></header>
  <main id="main-content" className="guide-main page-width">
   <span className="section-kicker">FIELD GUIDE</span><h1>Every action, from proposal to proof.</h1>
   <p className="lede">AI can write a draft. Reviewers approve the exact action and the workspace records the verified result.</p>
   <Link href="/console?view=workflows" className="button dark">Open workflows <ArrowRight size={16}/></Link>
   <div className="guide-questions">{sections.map(([title,body])=><details key={title}><summary>{title}</summary><p>{body}</p></details>)}</div>
  </main>
  <SiteFooter />
 </>;
}
