import {redirect} from "next/navigation";

export default function Reset(){
  redirect("/login?mode=recovery");
}
