import { redirect } from "next/navigation";

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { view } = await searchParams;
  redirect(typeof view === "string" ? "/workspace?view=" + encodeURIComponent(view) : "/workspace");
}
