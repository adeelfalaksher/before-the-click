import type { Metadata } from "next";
import Workspace from "./workspace";

export const metadata: Metadata = { title: "Workspace", robots: { index: false, follow: true } };

export default function WorkspacePage() {
  return <Workspace />;
}
