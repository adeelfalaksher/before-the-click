import Link from "next/link";
import { Brand, SiteFooter } from "../../ui";

export default function PrivacyRequestReceived() {
  return <>
    <header className="simple-header"><Brand /></header>
    <main id="main-content" className="guide-main page-width">
      <h1>Privacy request received</h1>
      <p className="lede">Your request has been saved for the project maintainers to review.</p>
      <Link className="button dark" href="/privacy">Return to the privacy policy</Link>
    </main>
    <SiteFooter />
  </>;
}
