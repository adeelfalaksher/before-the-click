"use client";
import {useEffect,useState} from "react";
import {CalendarDays,ChevronDown,Folder,Inbox,Loader2,RefreshCw,Search,ShieldCheck} from "lucide-react";
import {type GoogleResource,extractEmailAddress,isDriveFolder,resourceName} from "@/lib/resource-picker";

type Provider="gmail"|"calendar"|"drive";
export function ResourceBrowser({workspace,provider,account,onSelect}:{workspace:string;provider:Provider;account:string;onSelect:(item:GoogleResource,mode:"source"|"destination")=>void}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<GoogleResource[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[query,setQuery]=useState("");
 const [loadedAccount,setLoadedAccount]=useState("");
 useEffect(()=>{setOpen(false);setItems([]);setError("");setQuery("");setLoadedAccount("")},[workspace,provider,account]);
 async function load(){
  if(!workspace||!account)return;
  setBusy(true);setError("");
  try{
   const params=new URLSearchParams({workspace,provider});
   const response=await fetch("/api/integrations/google/resources?"+params,{cache:"no-store"});
   const data=await response.json();
   if(!response.ok)throw new Error(typeof data.error==="string"?data.error:"The account could not be read.");
   if(data.account!==account)throw new Error("The authorized account has changed. Reconnect and try again.");
   if(!Array.isArray(data.items))throw new Error("The provider returned an invalid resource list.");
   setItems(data.items);setLoadedAccount(account);
  }catch(e){setError(e instanceof Error?e.message:"Resources could not be loaded.");setItems([])}
  finally{setBusy(false)}
 }
 const visible=items.filter(item=>[resourceName(item,provider),item.from,item.snippet].some(v=>typeof v==="string"&&v.toLowerCase().includes(query.toLowerCase())));
 const Icon=provider==="gmail"?Inbox:provider==="calendar"?CalendarDays:Folder;
 return <div className="bt-resource-browser">
  <button type="button" className="bt-resource-toggle" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open&&loadedAccount!==account)void load()}}>
   <Icon size={17}/><span>Browse {provider==="gmail"?"your inbox":provider==="calendar"?"upcoming calendar events":"authorized Drive files"}</span><ChevronDown size={16}/>
  </button>
  {open&&<div className="bt-resource-panel">
   <div className="bt-resource-top"><span><ShieldCheck size={15}/> Live resources from {account}</span>
    <button type="button" disabled={busy} onClick={()=>void load()}><RefreshCw size={14} className={busy?"bt-spinning":""}/> Refresh</button></div>
   {error&&<p className="bt-resource-error" role="alert">{error}</p>}
   {busy?<p className="bt-resource-message" role="status"><Loader2 size={15} className="bt-spinning"/> Loading authorized resources…</p>:<>
    {items.length>0&&<label className="bt-resource-search"><Search size={15}/><input placeholder="Find by title or sender" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
    {!error&&!items.length&&<p className="bt-resource-message">{loadedAccount?"No accessible resources were returned by this account.":"Select refresh to retrieve your account's resources."}</p>}
    {visible.map((item,index)=><div className="bt-resource-item" key={String(item.id||index)}>
     <div><strong>{resourceName(item,provider)}</strong>
       <small>{provider==="gmail"?(item.from||"Sender unavailable"):provider==="calendar"?(item.start||"Date unavailable"):item.mimeType||"Google Drive"}</small>
       {typeof item.snippet==="string"&&<p>{item.snippet}</p>}</div>
     <div className="bt-resource-actions">
      {provider==="gmail"?<button type="button" disabled={!extractEmailAddress(String(item.from||""))} onClick={()=>onSelect(item,"source")}>Reply to sender</button>:
       provider==="calendar"?<button type="button" onClick={()=>onSelect(item,"source")}>Use as reference</button>:<>
        {!isDriveFolder(item)&&<button type="button" onClick={()=>onSelect(item,"source")}>Select file</button>}
        {isDriveFolder(item)&&<button type="button" onClick={()=>onSelect(item,"destination")}>Use as destination</button>}
       </>}
     </div>
    </div>)}
    {items.length>0&&!visible.length&&<p className="bt-resource-message">No matching resources.</p>}
   </>}
   <p className="bt-resource-footnote">Selecting a resource only prepares the proposed action. Nothing changes in Google until the required approvals and a separate execution step.</p>
  </div>}
 </div>;
}
