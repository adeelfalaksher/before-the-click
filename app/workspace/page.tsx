import {redirect} from "next/navigation";

export default async function WorkspacePage({
  searchParams
}: {
  searchParams: Promise<{view?: string; new?: string}>
}){
  const {view, new: create} = await searchParams;
  if (view === "map") redirect("/console?view=map");
  if (view === "review") redirect("/console?view=approvals");
  if (create === "1") redirect("/console?view=workflows");
  redirect("/console");
}
