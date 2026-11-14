"use client";
import {useEffect,useRef,useState} from "react";
import {CalendarDays,ChevronDown,Folder,Inbox,Loader2,RefreshCw,Search,ShieldCheck} from "lucide-react";
import {type GoogleResource,extractEmailAddress,isDriveFolder,resourceName} from "@/lib/resource-picker";

type Provider="gmail"|"calendar"|"drive";
type DrivePickerConfig={clientId:string;projectNumber:string;apiKey:string};
type DriveSelection={action:string;docs?:{id?:string}[]};
type PickerView={setIncludeFolders(value:boolean):PickerView;setSelectFolderEnabled(value:boolean):PickerView;setMode(value:string):PickerView;setMimeTypes(value:string):PickerView};
type PickerBuilder={addView(view:PickerView):PickerBuilder;setOAuthToken(token:string):PickerBuilder;setDeveloperKey(key:string):PickerBuilder;
 setAppId(id:string):PickerBuilder;setOrigin(origin:string):PickerBuilder;setCallback(callback:(data:DriveSelection)=>void):PickerBuilder;
 build():{setVisible(value:boolean):void}};
type GoogleWindow=Window&{
 gapi?:{load:(library:string,options:{callback:()=>void;onerror:()=>void;ontimeout:()=>void;timeout:number})=>void};
 google?:{
  accounts?:{oauth2:{initTokenClient:(options:{client_id:string;scope:string;hint:string;include_granted_scopes:boolean;
   callback:(result:{access_token?:string;error?:string})=>void;error_callback:()=>void})=>{requestAccessToken:(options:{prompt:string})=>void}}};
  picker?:{DocsView:new(id:string)=>PickerView;PickerBuilder:new()=>PickerBuilder;ViewId:{DOCS:string;FOLDERS:string};DocsViewMode:{LIST:string};Action:{PICKED:string;CANCEL:string}};
 };
};
const scripts=new Map<string,Promise<void>>();
function googleScript(src:string){
 const loaded=scripts.get(src);
 if(loaded)return loaded;
 const script=document.createElement("script");
 const promise=new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>{script.remove();reject(new Error("Google Picker scripts could not be loaded."));},7000);
  script.src=src;
  script.async=true;
  script.onload=()=>{clearTimeout(timer);resolve()};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error("Google Picker scripts could not be loaded."))};
  document.head.append(script);
 }).catch(error=>{scripts.delete(src);throw error});
 scripts.set(src,promise);
 return promise;
}
async function loadDrivePicker(){
 const target=window as GoogleWindow;
 await Promise.all([googleScript("https://apis.google.com/js/api.js"),googleScript("https://accounts.google.com/gsi/client")]);
 if(!target.gapi||!target.google?.accounts)throw new Error("Google Picker could not start.");
 if(!target.google.picker)await new Promise<void>((resolve,reject)=>{
  const fail=()=>reject(new Error("Google Drive Picker could not start."));
  target.gapi?.load("picker",{callback:resolve,onerror:fail,ontimeout:fail,timeout:7000});
 });
 const picker=target.google.picker;
 if(!picker)throw new Error("Google Drive Picker is unavailable.");
 return {picker,oauth2:target.google.accounts.oauth2};
}

export function ResourceBrowser({workspace,provider,account,onSelect}:{workspace:string;provider:Provider;account:string;onSelect:(item:GoogleResource,mode:"source"|"destination")=>void}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<GoogleResource[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[query,setQuery]=useState("");
 const [loadedAccount,setLoadedAccount]=useState("");
 const [pickerConfig,setPickerConfig]=useState<DrivePickerConfig|null>(null);
 const [drivePicker,setDrivePicker]=useState<Awaited<ReturnType<typeof loadDrivePicker>>|null>(null);
 const [pickerError,setPickerError]=useState("");
 const [picking,setPicking]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{
  setOpen(false);setItems([]);setError("");setQuery("");setLoadedAccount("");setPickerConfig(null);setPicking(false);setPickerError("");setBusy(false);
  return ()=>{generation.current++};
 },[workspace,provider,account]);
 useEffect(()=>{
  if(!pickerConfig)return;
  let current=true;
  setDrivePicker(null);
  loadDrivePicker().then(picker=>{if(current)setDrivePicker(picker)}).catch(error=>{
   if(current)setPickerError(error instanceof Error?error.message:"Google Picker is unavailable.");
  });
  return ()=>{current=false};
 },[pickerConfig]);
 async function load(){
  if(!workspace||!account)return;
  const active=generation.current;
  setBusy(true);setError("");
  try{
   const params=new URLSearchParams({workspace,provider});
   const response=await fetch("/api/integrations/google/resources?"+params,{cache:"no-store"});
   const data=await response.json();
   if(active!==generation.current)return;
   if(!response.ok)throw new Error(typeof data.error==="string"?data.error:"The account could not be read.");
   if(data.account!==account)throw new Error("The authorized account has changed. Reconnect and try again.");
   if(!Array.isArray(data.items))throw new Error("The provider returned an invalid resource list.");
   setItems(data.items);setLoadedAccount(account);
   setPickerConfig(data.picker??null);
  }catch(e){if(active===generation.current){setError(e instanceof Error?e.message:"Resources could not be loaded.");setItems([])}}
  finally{if(active===generation.current)setBusy(false)}
 }
 async function selectPickedDriveItem(id:string,mode:"source"|"destination",active:number){
  try{
   const params=new URLSearchParams({workspace,provider:"drive",resource:id});
   const response=await fetch("/api/integrations/google/resources?"+params,{cache:"no-store"});
   const data=await response.json();
   if(active!==generation.current)return;
   if(!response.ok)throw new Error("The workspace connection could not access that selection. Pick from its connected Google account and try again.");
   const item:GoogleResource|undefined=data.items?.[0];
   if(data.account!==account||!item||item.id!==id||isDriveFolder(item)!==(mode==="destination"))
    throw new Error(mode==="destination"?"Select a destination folder.":"Select a file instead of a folder.");
   setItems(items=>items.some(value=>value.id===id)?items:[item,...items]);
   onSelect(item,mode);
  }catch(error){if(active===generation.current)setPickerError(error instanceof Error?error.message:"The selected Drive item could not be checked.")}
  finally{if(active===generation.current)setPicking(false)}
 }
 function chooseOnDrive(mode:"source"|"destination"){
  if(!pickerConfig||!drivePicker)return;
  const active=generation.current;
  setPicking(true);setPickerError("");
  const fail=(message:string)=>{if(active===generation.current){setPickerError(message);setPicking(false)}};
  const {picker,oauth2}=drivePicker;
  try{
   const client=oauth2.initTokenClient({client_id:pickerConfig.clientId,scope:"https://www.googleapis.com/auth/drive.file",
    hint:account,include_granted_scopes:false,
    error_callback:()=>fail("Google authorization did not finish. Allow the browser pop-up and try again."),
    callback:result=>{
     if(active!==generation.current)return;
     if(!result.access_token){fail("Google did not authorize Drive Picker. Try again with the connected account.");return;}
     try{
      const folder=mode==="destination";
      const view=new picker.DocsView(folder?picker.ViewId.FOLDERS:picker.ViewId.DOCS).setIncludeFolders(true)
       .setSelectFolderEnabled(folder).setMode(picker.DocsViewMode.LIST);
      if(folder)view.setMimeTypes("application/vnd.google-apps.folder");
      new picker.PickerBuilder().addView(view).setOAuthToken(result.access_token).setDeveloperKey(pickerConfig.apiKey)
       .setAppId(pickerConfig.projectNumber).setOrigin(location.origin).setCallback(data=>{
        if(active!==generation.current)return;
        if(data.action===picker.Action.CANCEL){setPicking(false);return;}
        if(data.action!==picker.Action.PICKED)return;
        const id=data.docs?.[0]?.id;
        if(!id){fail("Google returned no Drive item.");return;}
        void selectPickedDriveItem(id,mode,active);
       }).build().setVisible(true);
     }catch{fail("Google Drive Picker could not open.")}
    }});
   client.requestAccessToken({prompt:""});
  }catch{fail("Google authorization could not start.")}
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
   {provider==="drive"&&loadedAccount&&<>
    <p className="bt-resource-footnote">Drive lists files this app can access. Grant a file and a destination folder individually from the connected Google account.</p>
    {pickerConfig?<div className="bt-resource-actions">
     <button type="button" disabled={!drivePicker||picking} onClick={()=>chooseOnDrive("source")}>Choose file in Google Drive</button>
     <button type="button" disabled={!drivePicker||picking} onClick={()=>chooseOnDrive("destination")}>Choose folder in Google Drive</button>
    </div>:<p className="bt-resource-footnote">Google Picker is unavailable. You can select previously authorized items below.</p>}
    {pickerError&&<p className="bt-resource-error" role="alert">{pickerError}</p>}
   </>}
   {busy?<p className="bt-resource-message" role="status"><Loader2 size={15} className="bt-spinning"/> Loading authorized resources…</p>:<>
    {items.length>0&&<label className="bt-resource-search"><Search size={15}/><input placeholder="Find by title or sender" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
    {!error&&!items.length&&<p className="bt-resource-message">{loadedAccount?"No accessible resources were returned by this account.":"Select refresh to retrieve your account's resources."}</p>}
    {visible.map((item,index)=><div className="bt-resource-item" key={String(item.id||index)}>
     <div><strong>{resourceName(item,provider)}</strong>
       <small>{provider==="gmail"?(item.from||"Sender unavailable"):provider==="calendar"?(item.start||"Date unavailable"):item.mimeType||"Google Drive"}</small>
       {typeof item.snippet==="string"&&<p>{item.snippet}</p>}</div>
     <div className="bt-resource-actions">
      {provider==="gmail"?<button type="button" disabled={!extractEmailAddress(String(item.from||""))} onClick={()=>onSelect(item,"source")}>Draft to sender</button>:
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
