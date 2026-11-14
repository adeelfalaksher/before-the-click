import type { Metadata } from "next";
import SharedReview from "./shared-review";

export const metadata: Metadata = {
  title: "Review a rehearsal",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};

export default function ReviewPage() {
  return <SharedReview />;
}
