import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Brand, SiteFooter } from "../ui";

export const metadata: Metadata = { title: "Field guide" };

const questions = [
  ["What’s a rehearsal?", "A rehearsal is a test of a proposed agent plan. It works on sample records or records you write into the workspace. A run can change those sandbox records and generate drafts. Live inboxes, calendars, and file stores are outside the workspace."],
  ["How do approvals work?", "Start with a plan, then put reviewers in order. The active reviewer can approve, request changes, or reject the plan. A revision sends the plan back to the first reviewer. The simulator unlocks once everyone has approved."],
  ["How do I invite someone?", "Go to Approvals and choose Share for review. Send each reviewer their individual link. Each link can record a decision only for its assigned reviewer. Links expire after 14 days. Refresh the queue to retrieve new decisions, or close the links to end access."],
  ["Where is my work saved?", "Your working copy, preferences and audit records are saved in this browser. Shared review packets live separately in private storage and exclude details from sources marked private. Use a workspace backup to move your work to another browser."],
  ["What is sent to Gemini?", "Gemini receives the goal and ordinary source records only when you choose Gemini planning. The planner substitutes a placeholder for records marked private. Keep confidential information out of the goal. Guided plans are built in your browser."],
  ["Can I try a different outcome?", "Duplicate a rehearsal from History to run a comparison. Keep the original as an audit record, change the action plan or sandbox rules, then review and rehearse the new version."]
];

export default function Guide() {
  return <><header className="simple-header"><Brand /><Link href="/workspace" className="button dark">Open workspace <ArrowRight size={16} /></Link></header>
    <main id="main-content" className="guide-main page-width">
      <div className="section-kicker">FIELD GUIDE</div><h1>Run your first rehearsal.</h1>
      <p className="lede">Choose a task, inspect the proposed actions, review the plan, and see what happens when you run it.</p>
      <Link className="button dark" href="/workspace?new=1">Choose a scenario <ArrowRight size={17} /></Link>
      <div className="guide-questions">{questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    </main><SiteFooter /></>;
}
