import Link from "next/link";
import { ArrowUpRight, Waypoints } from "lucide-react";

export function Brand({ footer = false }: { footer?: boolean }) {
  return <Link href="/" className={"brand" + (footer ? " brand-footer" : "")} aria-label="Before the Click home">
    <span className="brand-mark"><Waypoints size={20} strokeWidth={1.55} aria-hidden="true" /></span>
    <span>BEFORE<span className="brand-space"> </span>THE CLICK</span>
  </Link>;
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="footer-wrap">
    <div className="footer-brand"><Brand footer /><p>A workspace for reviewing and approving agent actions.</p></div>
    <nav aria-label="Footer">
      <Link href="/console">Workspace <ArrowUpRight size={13} /></Link>
      <Link href="/console?view=map">Simulator <ArrowUpRight size={13} /></Link>
      <Link href="/guide">Field guide <ArrowUpRight size={13} /></Link>
      <Link href="/privacy">Privacy policy <ArrowUpRight size={13} /></Link>
    </nav>
    <span className="footer-copyright">Before the Click © 2026</span>
  </div></footer>;
}
