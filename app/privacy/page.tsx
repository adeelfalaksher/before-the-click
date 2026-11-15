import type { Metadata } from "next";
import Link from "next/link";
import { Brand, SiteFooter } from "../ui";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPolicy() {
  return <>
    <header className="simple-header"><Brand /><Link className="button dark" href="/console">Open workspace</Link></header>
    <main id="main-content" className="guide-main page-width">
      <h1>Privacy policy</h1>
      <p className="lede">How Before the Click uses account, workspace, and Google data.</p>
      <div className="privacy-sections">
        <section>
          <h2>Accounts and workspaces</h2>
          <p>We store your username, display name, password and recovery-code hashes, and session information to operate your account. Supabase stores workspace memberships, proposals, approval decisions, files, and audit records. Workspace members can see shared records according to their role.</p>
        </section>
        <section>
          <h2>Google connections</h2>
          <p>Each Google connection is optional. Gmail access displays recent message details to help you prepare an email, sends email you explicitly execute after approval, and checks the sent message. Calendar access displays upcoming events, creates approved events on your primary calendar, and checks the result. Drive access displays files and folders you authorize, moves the selected file after approval, and checks the destination.</p>
          <p>We store your connected account address and permissions and encrypt OAuth tokens on the server. Workspace records can include information you put in a proposal, details about the authorized destination, and receipts returned after execution. Members with workspace access can see the proposal and its audit history.</p>
          <p>Before the Click uses Google Workspace data to provide these features. It does not use Google Workspace data for advertising or model training. Our use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>
        </section>
        <section>
          <h2>AI drafting</h2>
          <p>When you choose to draft with AI, the text you submit for drafting goes to Gemini or OpenRouter, depending on availability and your selection. The drafting button does not attach your Google inbox, calendar, Drive files, or connection credentials. Use only information you are permitted to share with the selected provider.</p>
        </section>
        <section>
          <h2>Disconnecting and deleting data</h2>
          <p>Open Integrations in your workspace to disconnect a Google account. This removes the stored connection and attempts to revoke access at Google. You can also remove the grant in your <a href="https://myaccount.google.com/connections">Google Account</a>. Disconnecting does not erase previously saved proposals, audit records, or changes already made in Google.</p>
          <p>Sign in to send a private request to the project maintainers about your Before the Click account.</p>
          <form action="/api/privacy" method="post">
            <button className="button dark" name="request" value="access">Request a copy of my data</button>{" "}
            <button className="button dark" name="request" value="deletion">Request account deletion</button>
          </form>
        </section>
      </div>
    </main>
    <SiteFooter />
  </>;
}
