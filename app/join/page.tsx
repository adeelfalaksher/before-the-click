import Link from "next/link";
import { currentAccount } from "@/lib/server-account";
import { Brand } from "../ui";
import { AcceptInvitation } from "./accept-invitation";
import "@/app/console/product.css";

export default async function Join({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const validToken = typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? token : null;
  const account = validToken ? await currentAccount() : null;

  return <main className="bt-reset" id="main-content">
    <Brand />
    <section className="bt-auth-panel">
      <h1>Join your team</h1>
      {validToken ? <AcceptInvitation token={validToken} username={account?.username} /> :
        <p role="alert">This invitation link is invalid. Ask a workspace administrator for a new link.</p>}
      {!validToken && <Link className="bt-small-link" href="/console">Back to workspace</Link>}
    </section>
  </main>;
}
