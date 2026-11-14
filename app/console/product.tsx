"use client";

import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {
 Activity,ArrowDownRight,ArrowRight,ArrowUpRight,Bell,Check,CheckCircle2,ChevronDown,Download,
 ChevronRight,Clock3,FileText,FolderClosed,Inbox,KeyRound,Layers,LayoutDashboard,LogOut,
 Mail,Plus,RefreshCw,Search,Settings2,ShieldCheck,Sparkles,Users,Workflow,
 X,CalendarDays,ExternalLink,LockKeyhole,Send,AlertTriangle,Copy
} from "lucide-react";
import {browserStorage} from "@/lib/supabase-browser";
import {workspaceRequest} from "@/lib/workspace-client";
import {ResourceBrowser} from "./resource-browser";
import {extractEmailAddress} from "@/lib/resource-picker";
import {Brand} from "../ui";
import {ActionMap} from "./action-map";

type View="overview"|"workflows"|"approvals"|"map"|"records"|"integrations"|"policies"|"audit"|"team"|"settings";
type W={id:string;name:string;owner_id:string;created_at:string};
type Member={workspace_id:string;user_id:string;role:string};
type Person={id:string;display_name:string};
type Flow={id:string;workspace_id:string;created_by:string;title:string;status:string;current_version:number;created_at:string;updated_at:string};
type Version={id:string;workflow_id:string;version:number;objective:string;created_at:string};
type Proposed={id:string;version_id:string;provider:string;operation:string;resource_id:string;document:any};
type Step={version_id:string;position:number;reviewer_id:string};
type Decision={version_id:string;position:number;decision:string;comment:string;created_at:string};
type Connection={id:string;provider:string;account:string;connected_at:string;owner_id:string};
type Policy={workspace_id:string;allow_send:boolean;allow_calendar:boolean;allow_drive:boolean;allow_self_approval:boolean};
type Audit={id:number;event:string;detail:Record<string,unknown>;created_at:string;workflow_id:string|null};
type Stored={id:string;title:string;body:string;created_at:string};
type Attachment={id:string;workspace_id:string;uploader_id:string;object_path:string;filename:string;mime_type:string;byte_size:number;created_at:string};
type Notice={text:string;bad?:boolean};
type Provider="workspace"|"gmail"|"calendar"|"drive";
const menu:{id:View;label:string;icon:typeof LayoutDashboard}[]=[
 {id:"overview",label:"Overview",icon:LayoutDashboard},{id:"workflows",label:"Workflows",icon:Workflow},
 {id:"approvals",label:"Approvals",icon:CheckCircle2},{id:"map",label:"Simulator",icon:Layers},{id:"records",label:"Saved records",icon:FileText},
 {id:"integrations",label:"Integrations",icon:KeyRound},{id:"policies",label:"Policies",icon:ShieldCheck},
 {id:"audit",label:"Audit log",icon:Activity},{id:"team",label:"Team",icon:Users},{id:"settings",label:"Settings",icon:Settings2}
];
const statusNames:Record<string,string>={
 awaiting_approval:"In review",approved:"Ready to execute",completed:"Completed",
 changes_requested:"Changes requested",rejected:"Rejected",failed:"Failed",
 executing:"Executing",needs_verification:"Verification needed",draft:"Draft",cancelled:"Cancelled"
};
const pretty=(date:string)=>new Date(date).toLocaleString(undefined,{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const idLabel=(id:string)=>id.slice(0,8).toUpperCase();
const short=(s:string,max=120)=>s.length>max?s.slice(0,max)+"…":s;
function localDateInput(value:string){
 const date=new Date(value);
 if(!value||!Number.isFinite(date.getTime()))return "";
 if(!/(?:Z|[+-]\d\d:\d\d)$/.test(value))return value;
 return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);
}
function apiError(value:any){return typeof value?.error==="string"?value.error:"The operation could not be completed.";}
function Status({value}:{value:string}){
 const tone=value==="completed"?"good":value==="approved"?"blue":value==="failed"||value==="rejected"?"bad":value==="needs_verification"?"warn":"neutral";
 return <span className={"bt-status "+tone}><i/>{statusNames[value]||value.replaceAll("_"," ")}</span>;
}

export default function Console({userId,username}:{userId:string;username:string}){
 const [view,setView]=useState<View>("overview"),[workspaces,setWorkspaces]=useState<W[]>([]);
 const [memberships,setMemberships]=useState<Member[]>([]),[workspaceId,setWorkspaceId]=useState("");
 const [members,setMembers]=useState<Member[]>([]),[people,setPeople]=useState<Person[]>([]);
 const [flows,setFlows]=useState<Flow[]>([]),[versions,setVersions]=useState<Version[]>([]);
 const [actions,setActions]=useState<Proposed[]>([]),[steps,setSteps]=useState<Step[]>([]);
 const [decisions,setDecisions]=useState<Decision[]>([]),[connections,setConnections]=useState<Connection[]>([]);
 const [policy,setPolicy]=useState<Policy|null>(null),[audit,setAudit]=useState<Audit[]>([]);
 const [records,setRecords]=useState<Stored[]>([]),[attachments,setAttachments]=useState<Attachment[]>([]),[notifications,setNotifications]=useState<{id:number;message:string;read_at:string|null}[]>([]);
 const [initializing,setInitializing]=useState(true),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false);
 const [notice,setNotice]=useState<Notice|null>(null),[createWorkspace,setCreateWorkspace]=useState(false),[workspaceName,setWorkspaceName]=useState("");
 const [createFlow,setCreateFlow]=useState(false),[selectedFlow,setSelectedFlow]=useState<string|null>(null),[confirmExecute,setConfirmExecute]=useState<string|null>(null);
 const [mapFlow,setMapFlow]=useState("");
 const [search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const [config,setConfig]=useState({google:false,gemini:false,openrouter:false});
 const [draftProvider,setDraftProvider]=useState<"auto"|"openrouter">("auto");
 const [composer,setComposer]=useState({
  title:"",objective:"",provider:"workspace" as Provider,subject:"",body:"",
  to:"",account:"",start:"",end:"",fileId:"",destinationId:"",reviewers:[] as string[],sensitive:false
 });
 const [teamUsername,setTeamUsername]=useState(""),[teamRole,setTeamRole]=useState("reviewer"),[inviteLink,setInviteLink]=useState("");
 const [editingId,setEditingId]=useState<string|null>(null);
 const [profileName,setProfileName]=useState(""),[drafting,setDrafting]=useState(false);
 const activeWorkspace=workspaces.find(w=>w.id===workspaceId);
 const ownRole=members.find(m=>m.user_id===userId)?.role??memberships.find(m=>m.workspace_id===workspaceId)?.role??"member";
 const isAdmin=ownRole==="owner"||ownRole==="admin";
 const selected=flows.find(f=>f.id===selectedFlow)||null;
 const version=selected?versions.find(v=>v.workflow_id===selected.id&&v.version===selected.current_version):null;
 const action=version?actions.find(a=>a.version_id===version.id):null;
 const selectedSteps=version?steps.filter(s=>s.version_id===version.id).sort((a,b)=>a.position-b.position):[];
 const selectedDecisions=version?decisions.filter(d=>d.version_id===version.id):[];
 const nextReviewer=selectedSteps.find(s=>!selectedDecisions.some(d=>d.position===s.position));
 const mapped=flows.find(f=>f.id===mapFlow)??flows[0];
 const mapVersion=mapped&&versions.find(v=>v.workflow_id===mapped.id&&v.version===mapped.current_version);
 const mapAction=mapVersion&&actions.find(a=>a.version_id===mapVersion.id);
 const mapSteps=mapVersion?steps.filter(s=>s.version_id===mapVersion.id):[];
 const mapApprovals=mapVersion?decisions.filter(d=>d.version_id===mapVersion.id&&d.decision==="approved"):[];
 const mapReceipt=mapped&&audit.find(event=>event.workflow_id===mapped.id&&event.event==="execution.completed")?.detail.reference;
 const currentMembership=memberships.find(m=>m.workspace_id===workspaceId);
 const displayName=(id:string)=>people.find(p=>p.id===id)?.display_name|| (id===userId?username:idLabel(id));
 const assignedReviewers=members.filter(m=>["owner","admin","reviewer"].includes(m.role)&&(m.user_id!==userId||policy?.allow_self_approval===true));
 const isApprover=(flow:Flow)=>{
   const v=versions.find(v=>v.workflow_id===flow.id&&v.version===flow.current_version);
   if(!v)return false;
   const pending=steps.filter(s=>s.version_id===v.id).sort((a,b)=>a.position-b.position).find(s=>!decisions.some(d=>d.version_id===v.id&&d.position===s.position));
   return flow.status==="awaiting_approval"&&pending?.reviewer_id===userId;
 };
 const mine=flows.filter(f=>isApprover(f));

 const announce=(text:string,bad=false)=>setNotice({text,bad});
 useEffect(()=>{if(!notice)return;const timeout=setTimeout(()=>setNotice(null),6500);return()=>clearTimeout(timeout)},[notice]);

 const refreshWorkspaces=useCallback(async()=>{
  try{
   const {memberships,workspaces:sorted}=await workspaceRequest<{memberships:Member[];workspaces:W[]}>("workspaces");
   setMemberships(memberships);
   setWorkspaces(sorted);
   setWorkspaceId(current=>sorted.some(w=>w.id===current)?current:(sorted[0]?.id||""));
  }catch(e){announce(e instanceof Error?e.message:"Cannot load your workspaces.",true);}
  finally{setInitializing(false);}
 },[userId]);

 const refresh=useCallback(async(id:string)=>{
  if(!id)return;
  setLoading(true);
  try{
   const data=await workspaceRequest<{
    flows:Flow[];members:Member[];connections:Connection[];policy:Policy|null;audit:Audit[];
    records:Stored[];attachments:Attachment[];notifications:{id:number;message:string;read_at:string|null}[];
    people:Person[];versions:Version[];actions:Proposed[];steps:Step[];decisions:Decision[];
   }>("snapshot",{workspace:id});
   setFlows(data.flows);setMembers(data.members);setConnections(data.connections);setPolicy(data.policy);
   setAudit(data.audit);setRecords(data.records);setAttachments(data.attachments);setNotifications(data.notifications);
   setPeople(data.people);setProfileName(data.people.find(p=>p.id===userId)?.display_name||"");
   setVersions(data.versions);setActions(data.actions);setSteps(data.steps);setDecisions(data.decisions);
  }catch(e){announce(e instanceof Error?e.message:"Could not refresh workspace.",true);}
  finally{setLoading(false);}
 },[userId]);

 useEffect(()=>{void refreshWorkspaces();fetch("/api/integrations/status").then(r=>r.ok?r.json():null).then(d=>{if(d)setConfig(d)}).catch(()=>{});},[refreshWorkspaces]);
 useEffect(()=>{if(workspaceId)void refresh(workspaceId);},[workspaceId,refresh]);
 useEffect(()=>{
  const p=new URLSearchParams(location.search),v=p.get("view");
  const initialView=menu.find(item=>item.id===v);
  if(initialView)setView(initialView.id);
  if(p.get("connected"))announce("Google account connected.");
  if(p.get("error"))announce(p.get("error")==="google-config"?"Google OAuth needs client credentials.":"Could not connect Google: "+p.get("error"),true);
  if(p.get("connected")||p.get("error"))history.replaceState({}, "", "/console?view=integrations");
 },[]);

 async function newWorkspace(e:React.FormEvent){
  e.preventDefault();setSaving(true);
  try{
   const data=await workspaceRequest<string>("btc_workspace",{name:workspaceName.trim()});
   setCreateWorkspace(false);setWorkspaceName("");
   await refreshWorkspaces();setWorkspaceId(data);announce("Workspace created.");
  }catch(e){announce(e instanceof Error?e.message:"Could not create workspace.",true);}
  finally{setSaving(false);}
 }
 function startWorkflow(){
  setEditingId(null);
  setComposer({title:"",objective:"",provider:"workspace",subject:"",body:"",to:"",account:"",start:"",end:"",fileId:"",destinationId:"",
   reviewers:assignedReviewers.some(m=>m.user_id===userId)?[userId]:[],sensitive:false});
  setCreateFlow(true);
 }
 async function composeWithAI(){
  if(!composer.objective.trim()){announce("Describe the action before asking AI to draft it.",true);return;}
  setDrafting(true);
  try{
   const r=await fetch("/api/compose",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({objective:composer.objective,kind:composer.provider==="gmail"?"email":"record",context:"",provider:draftProvider})});
   const d=await r.json();if(!r.ok)throw new Error(apiError(d));
   setComposer(v=>({...v,subject:d.subject,body:d.body}));announce(`Draft prepared by ${d.provider}. Review and edit before submitting.`);
  }catch(e){announce(e instanceof Error?e.message:"AI drafting failed.",true);}
  finally{setDrafting(false);}
 }
 async function sendProposal(e:React.FormEvent){
  e.preventDefault();setSaving(true);
  try{
   const provider=composer.provider,operation=provider==="workspace"?"publish_record":provider==="gmail"?"send":provider==="calendar"?"create_event":"move_file";
   const workspace=workspaceId;
   if(!workspace)throw new Error("Select a workspace.");
   const doc={account:provider==="workspace"?undefined:composer.account,
    proposal:{subject:composer.subject,body:composer.body,to:provider==="gmail"?composer.to:undefined,
     start:provider==="calendar"?new Date(composer.start).toISOString():undefined,end:provider==="calendar"?new Date(composer.end).toISOString():undefined,
     fileId:provider==="drive"?composer.fileId:undefined,destinationId:provider==="drive"?composer.destinationId:undefined},
    sensitive:composer.sensitive,risk:provider==="workspace"?"low":"high"};
   const r=await fetch("/api/workflows",{method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({workspace,...(editingId?{workflow:editingId,expectedVersion:flows.find(f=>f.id===editingId)?.current_version}:{}),title:composer.title,objective:composer.objective,provider,operation,
      resource:provider==="workspace"?"new-record":provider==="gmail"?composer.to:provider==="calendar"?"primary":composer.fileId,
      document:doc,reviewers:composer.reviewers})});
   const d=await r.json();if(!r.ok)throw new Error(apiError(d));
   setCreateFlow(false);setEditingId(null);setSelectedFlow(d.id);setView("workflows");await refresh(workspace);announce("Action submitted for review.");
  }catch(e){announce(e instanceof Error?e.message:"Could not submit action.",true);}
  finally{setSaving(false);}
 }
 async function decide(flow:Flow,choice:"approved"|"changes_requested"|"rejected",note:string){
  const v=versions.find(v=>v.workflow_id===flow.id&&v.version===flow.current_version);
  if(!v)return;setSaving(true);
  try{
   await workspaceRequest("btc_decide",{f:flow.id,v:v.id,d:choice,note});
   await refresh(workspaceId);announce(choice==="approved"?"Decision recorded.":choice==="changes_requested"?"Changes requested.":"Action rejected.");
  }catch(e){announce(e instanceof Error?e.message:"Decision was not saved.",true);}
  finally{setSaving(false);}
 }
 async function execute(flowId:string){
  setSaving(true);setConfirmExecute(null);
  try{
   const r=await fetch("/api/workflows/execute",{method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({workflow:flowId})});
   const d=await r.json();
   await refresh(workspaceId);
   if(!r.ok)throw new Error(d.detail?.message||apiError(d));
   announce("Operation completed and verified. Reference: "+short(d.reference||"",18));
  }catch(e){announce(e instanceof Error?e.message:"Execution could not be confirmed.",true);}
  finally{setSaving(false);}
 }
 async function cancelWorkflow(flowId:string){
  if(!confirm("Cancel this workflow and close its approval request?"))return;
  setSaving(true);
  try{
   await workspaceRequest("btc_cancel",{f:flowId});
   await refresh(workspaceId);
   announce("Workflow cancelled.");
  }catch(e){announce(e instanceof Error?e.message:"Could not cancel the workflow.",true);}
  finally{setSaving(false);}
 }
 async function downloadAudit(){
  if(!workspaceId)return;
  setSaving(true);
  try{
   const data=await workspaceRequest("btc_export_audit",{w:workspaceId});
   const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
   const url=URL.createObjectURL(blob);
   const link=document.createElement("a");
   link.href=url;
   link.download=`before-the-click-audit-${idLabel(workspaceId)}.json`;
   link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){announce(e instanceof Error?e.message:"Could not export the audit log.",true);}
  finally{setSaving(false);}
 }
 async function updatePolicies(next:Policy){
  if(!isAdmin)return;setSaving(true);
  try{
   await workspaceRequest("btc_policies",{w:workspaceId,sending:next.allow_send,calendar:next.allow_calendar,
    drive:next.allow_drive,self_approval:next.allow_self_approval});
   await refresh(workspaceId);announce("Workspace policy updated.");
  }catch(e){announce(e instanceof Error?e.message:"Could not update policy.",true);}
  finally{setSaving(false);}
 }
 async function invite(e:React.FormEvent){
  e.preventDefault();setSaving(true);setInviteLink("");
  try{
   const r=await fetch("/api/invitations",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workspace:workspaceId,username:teamUsername,role:teamRole})});
   const d=await r.json();if(!r.ok)throw new Error(apiError(d));
   setInviteLink(d.url);announce("Invitation created. Share this link with the intended recipient.");
  }catch(e){announce(e instanceof Error?e.message:"Could not create invitation.",true);}
  finally{setSaving(false);}
 }
 async function disconnect(provider:"gmail"|"calendar"|"drive"){
  if(!confirm("Disconnect this Google account? Existing approved workflows will not be able to execute through it."))return;
  setSaving(true);
  try{
   const r=await fetch("/api/integrations/disconnect",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workspace:workspaceId,provider})});
   const data=await r.json();if(!r.ok)throw new Error(apiError(data));
   await refresh(workspaceId);
   announce(data.googleRevoked?"Connection revoked and removed.":"Connection removed. Also revoke app access in your Google Account to invalidate the grant.");
  }catch(e){announce(e instanceof Error?e.message:"Could not disconnect account.",true)}
  finally{setSaving(false)}
 }
 function reviseWorkflow(flow:Flow){
  const v=versions.find(v=>v.workflow_id===flow.id&&v.version===flow.current_version);
  const a=v?actions.find(a=>a.version_id===v.id):null;
  if(!v||!a)return;
  const current=a.document?.proposal||{};
  setComposer({title:flow.title,objective:v.objective,provider:a.provider as Provider,
   subject:current.subject||"",body:current.body||"",to:current.to||"",account:a.document?.account||"",
   start:localDateInput(current.start||""),end:localDateInput(current.end||""),fileId:current.fileId||"",destinationId:current.destinationId||"",
  reviewers:steps.filter(s=>s.version_id===v.id&&assignedReviewers.some(m=>m.user_id===s.reviewer_id)).sort((x,y)=>x.position-y.position).map(s=>s.reviewer_id),
   sensitive:Boolean(a.document?.sensitive)});
  setEditingId(flow.id);setCreateFlow(true);
 }
 async function uploadAttachment(file:File){
  if(!workspaceId)return announce("Select a workspace first.",true);
  const valid=new Set(["application/pdf","image/jpeg","image/png","text/plain","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
  if(file.size<1||file.size>10485760||!valid.has(file.type))return announce("Choose a PDF, Word, TXT, PNG or JPG file under 10 MB.",true);
  setUploading(true);
  try{
   const {path,token}=await workspaceRequest<{path:string;token:string}>("file_upload",{workspace:workspaceId});
   const {error}=await browserStorage().from("btc-workspace-files").uploadToSignedUrl(path,token,file,{contentType:file.type,cacheControl:"0"});
   if(error)throw error;
   await workspaceRequest("file_add",{workspace:workspaceId,path,filename:file.name.slice(0,180),mime:file.type,size:file.size});
   await refresh(workspaceId);announce("Document uploaded to private workspace storage.");
  }catch(e){announce(e instanceof Error?e.message:"Could not upload the document.",true);}
  finally{setUploading(false);}
 }
 async function openAttachment(file:Attachment){
  try{
   const {signedPath}=await workspaceRequest<{signedPath:string}>("file_read",{id:file.id});
   const anchor=document.createElement("a");
   anchor.href=process.env.NEXT_PUBLIC_SUPABASE_URL+"/storage/v1"+signedPath;anchor.rel="noopener noreferrer";anchor.target="_blank";
   document.body.append(anchor);anchor.click();anchor.remove();
  }catch(e){announce(e instanceof Error?e.message:"Could not open document.",true);}
 }
 async function deleteAttachment(file:Attachment){
  if(!confirm("Permanently remove this uploaded document?"))return;
  setSaving(true);
  try{
   await workspaceRequest("file_remove",{id:file.id});
   await refresh(workspaceId);announce("Document deleted from workspace storage.");
  }catch(e){announce(e instanceof Error?e.message:"Could not delete the document.",true);}
  finally{setSaving(false);}
 }
 async function saveProfile(e:React.FormEvent){
  e.preventDefault();setSaving(true);
  try{
   await workspaceRequest("btc_profile",{name:profileName.trim()});
   await refresh(workspaceId);announce("Profile saved.");
  }catch(e){announce(e instanceof Error?e.message:"Could not save profile.",true);}
  finally{setSaving(false);}
 }
 async function logOut(){
  try{
   const response=await fetch("/api/account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});
   if(!response.ok)throw new Error("Could not sign out. Try again.");
   location.replace("/login");
  }catch(e){announce(e instanceof Error?e.message:"Could not sign out.",true);}
 }
 async function markNotification(id:number){
  try{await workspaceRequest("btc_notification",{n:String(id)});await refresh(workspaceId);}
  catch(e){announce(e instanceof Error?e.message:"Could not mark notification.",true);}
 }
 const connected=(provider:string)=>connections.find(c=>c.provider===provider&&c.owner_id===userId);
 const chooseView=(v:View)=>{setView(v);setSelectedFlow(null);setSearch("");setFilter("all");};
 const sectionTitles:Record<View,[string,string]>={
  overview:["Your control center.","Every action has an owner, a decision and a record."],
  workflows:["Workflows.","A clear record of what is proposed and what actually happens."],
  approvals:["Your decisions.","Review only the requests assigned to you."],
  map:["Simulator map","Inspect the proposal, review order, execution status and receipt for a workflow."],
  records:["Verified records.","Content saved after a completed approval sequence."],
  integrations:["Connected accounts.","Only authorized services can receive an action."],
  policies:["Rules of engagement.","Deterministic controls applied on the server before execution."],
  audit:["The activity ledger.","A persistent, timestamped record of workspace activity."],
  team:["People and permissions.","Put accountable reviewers in the right order."],
  settings:["Your settings.","Maintain your identity and secure workspace access."]
 };
 return <div className="bt-app">
   <header className="bt-topbar">
    <Brand />
    <div className="bt-breadcrumb">Workspace <ChevronRight size={14}/><span>{menu.find(x=>x.id===view)?.label}</span></div>
    <div className="bt-top-actions">
     <button className="bt-icon-button" aria-label="Refresh data" title="Refresh workspace" disabled={loading||!workspaceId} onClick={()=>void refresh(workspaceId)}><RefreshCw size={17} className={loading?"bt-spin":""}/></button>
     <button className="bt-icon-button" aria-label="View notifications" title="Notifications" onClick={()=>chooseView("approvals")}><Bell size={17}/>{notifications.some(n=>!n.read_at)&&<i className="bt-notification-dot"/>}</button>
     <div className="bt-avatar">{(username[0]||"U").toUpperCase()}</div>
    </div>
   </header>
   <aside className="bt-sidebar">
    <div className="bt-workspace-control">
     <span className="bt-eyebrow">CURRENT WORKSPACE</span>
     <select aria-label="Choose workspace" value={workspaceId} onChange={e=>{setWorkspaceId(e.target.value);setSelectedFlow(null);}} disabled={!workspaces.length}>
      {!workspaces.length?<option>No workspace</option>:workspaces.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}
     </select>
     <button onClick={()=>setCreateWorkspace(true)}><Plus size={14}/> New workspace</button>
    </div>
    <div className="bt-nav-label">WORK</div>
    <nav className="bt-side-nav" aria-label="Workspace">
     {menu.slice(0,5).map(({id,label,icon:Icon})=><button key={id} className={view===id?"active":""} onClick={()=>chooseView(id)}>
      <Icon size={18} strokeWidth={1.8}/><span>{label}</span>{id==="approvals"&&mine.length>0&&<small>{mine.length}</small>}
     </button>)}
     <div className="bt-nav-label">CONTROL & ACCOUNT</div>
     {menu.slice(5).map(({id,label,icon:Icon})=><button key={id} className={view===id?"active":""} onClick={()=>chooseView(id)}>
      <Icon size={18} strokeWidth={1.8}/><span>{label}</span>
     </button>)}
    </nav>
    <div className="bt-sidebar-bottom"><div className="bt-live-dot"/>Secure session active
      <button onClick={logOut} title="Sign out"><LogOut size={17}/></button>
    </div>
   </aside>
   <div className="bt-content">
    <main className="bt-main" id="main-content">
     <div className="bt-page-heading"><div><span className="bt-eyebrow">BEFORE THE CLICK / {view.toUpperCase()}</span>
      <h1>{sectionTitles[view][0]}</h1><p>{sectionTitles[view][1]}</p></div>
      {workspaceId&&!["settings","team","policies","audit"].includes(view)&&
       <button className="bt-primary" onClick={startWorkflow}><Plus size={17}/> New workflow</button>}
     </div>
     {initializing?<div className="bt-empty">Loading your account…</div>:
      !workspaces.length?<section className="bt-first-run">
       <span className="bt-eyebrow">START HERE</span><h2>A place for decisions worth checking.</h2>
       <p>Create a workspace to invite teammates, prepare actions and keep a verified record of each outcome.</p>
       <button className="bt-primary" onClick={()=>setCreateWorkspace(true)}><Plus size={17}/> Create your workspace</button>
      </section>: <>
      {view==="overview"&&<>
       <section className="bt-stats">
        <div><span>Workflow total</span><strong>{flows.length.toString().padStart(2,"0")}</strong><small>In this workspace</small></div>
        <div><span>Awaiting your decision</span><strong>{mine.length.toString().padStart(2,"0")}</strong><small>Action required</small></div>
        <div><span>Ready to execute</span><strong>{flows.filter(f=>f.status==="approved").length.toString().padStart(2,"0")}</strong><small>Approved plans</small></div>
        <div><span>Verified completions</span><strong>{flows.filter(f=>f.status==="completed").length.toString().padStart(2,"0")}</strong><small>Recorded outcomes</small></div>
       </section>
       <div className="bt-overview-grid">
        <section className="bt-card bt-focus">
         <div className="bt-card-header"><span className="bt-eyebrow">ACTION QUEUE</span><button className="bt-text-action" onClick={()=>chooseView("approvals")}>View approvals <ArrowUpRight size={14}/></button></div>
         <h2>What needs a decision?</h2>
         {mine.length?mine.slice(0,4).map(flow=><button className="bt-flow-line" key={flow.id} onClick={()=>{setView("workflows");setSelectedFlow(flow.id);}}>
          <span className="bt-flow-icon"><CheckCircle2 size={17}/></span><span><strong>{flow.title}</strong><small>{pretty(flow.created_at)}</small></span><Status value={flow.status}/><ChevronRight size={16}/>
         </button>):<div className="bt-empty in-card"><CheckCircle2 size={23}/><strong>Nothing is waiting on you.</strong><span>New approvals will appear here.</span></div>}
        </section>
        <section className="bt-card bt-method">
         <div className="bt-eyebrow">HOW EVERY ACTION MOVES</div><h2>Approval isn’t execution.</h2><p>Nothing reaches a connected account until its final version passes review and policy checks.</p>
         {["Propose","Review","Execute","Verify"].map((step,i)=><div className="bt-method-step" key={step}><span>0{i+1}</span>{step}<ArrowDownRight size={15}/></div>)}
        </section>
       </div>
       <section className="bt-card bt-recent"><div className="bt-card-header"><div><span className="bt-eyebrow">RECENT WORK</span><h2>Latest workflows</h2></div><button className="bt-text-action" onClick={()=>chooseView("workflows")}>See all <ArrowRight size={15}/></button></div>
       {flows.length?flows.slice(0,5).map(f=><button className="bt-table-row" key={f.id} onClick={()=>{setView("workflows");setSelectedFlow(f.id);}}>
        <span className="bt-record-id">{idLabel(f.id)}</span><strong>{f.title}</strong><Status value={f.status}/><span className="bt-date">{pretty(f.updated_at)}</span><ChevronRight size={17}/></button>):
        <div className="bt-empty in-card">No workflows yet. Create one to start your audit trail.</div>}
       </section>
      </>}
      {view==="map"&&(mapped?<>
       <label className="field run-select bt-map-select">Workflow<select value={mapped.id} onChange={e=>setMapFlow(e.target.value)}>
        {flows.map(flow=><option key={flow.id} value={flow.id}>{flow.title}</option>)}
       </select></label>
       <ActionMap key={`${mapped.id}:${mapped.current_version}`} title={mapped.title} status={statusNames[mapped.status]||mapped.status}
        details={[
         <div className="source-note" key="proposal"><strong>{mapAction?.document?.proposal?.subject||mapped.title}</strong><p>{mapVersion?.objective||"Loading proposal details…"}</p><p>{mapAction?.provider==="workspace"?"Workspace record":mapAction?.document?.account}</p></div>,
         <p key="approval">{mapApprovals.length} of {mapSteps.length} reviewers approved version {mapped.current_version}.</p>,
         <p key="execution">{statusNames[mapped.status]||mapped.status}. {mapped.status==="approved"?"The workflow owner can execute this version from the approval queue.":null}</p>,
         <p key="verification">{mapped.status==="completed"?mapReceipt?`Verified. Reference ${String(mapReceipt)}.`:"Verified. See the workspace audit log for the receipt.":mapped.status==="needs_verification"?"The provider outcome needs verification.":"A receipt appears here after successful execution."}</p>
        ]}
        onReview={()=>{setSelectedFlow(mapped.id);setView("workflows");}}/>
      </>:<section className="bt-card bt-empty in-card"><strong>No workflows to inspect yet.</strong><button className="bt-secondary" onClick={startWorkflow}>Create a workflow <ArrowRight size={15}/></button></section>)}
      {view==="workflows"&& !selected&&<>
       <div className="bt-toolbar"><label className="bt-search"><Search size={17}/><input placeholder="Search workflows" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter status"><option value="all">All statuses</option>
         {Object.entries(statusNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
       </div>
       <section className="bt-card bt-list"><div className="bt-table-caption">ID <span>WORKFLOW</span><span>STATUS</span><span>LAST UPDATED</span></div>
        {flows.filter(f=>(filter==="all"||f.status===filter)&&f.title.toLowerCase().includes(search.toLowerCase())).map(f=>
         <button key={f.id} className="bt-table-row" onClick={()=>setSelectedFlow(f.id)}><span className="bt-record-id">{idLabel(f.id)}</span><strong>{f.title}</strong><Status value={f.status}/><span className="bt-date">{pretty(f.updated_at)}</span><ChevronRight size={17}/></button>)}
        {!flows.length&&<div className="bt-empty in-card"><Workflow size={24}/><strong>No workflows created.</strong><span>Your first approved action starts here.</span><button className="bt-secondary" onClick={startWorkflow}>Create workflow <ArrowRight size={15}/></button></div>}
       </section>
      </>}
      {view==="workflows"&&selected&&<>
       <button className="bt-back" onClick={()=>setSelectedFlow(null)}><ArrowRight size={14}/> All workflows</button>
       <section className="bt-card bt-detail">
        <div className="bt-detail-header"><div><div className="bt-eyebrow">WORKFLOW {idLabel(selected.id)} · VERSION {selected.current_version}</div>
          <h2>{selected.title}</h2><p>{version?.objective||""}</p></div><Status value={selected.status}/></div>
        <div className="bt-progress-steps">{["Proposed","Review","Approved","Execute","Verified"].map((stage,i)=>
         <div className="bt-progress-step" key={stage}><span className={selected.status==="completed"||i===0?"done":selected.status==="approved"&&i<=2?"done":""}>{i+1}</span>{stage}</div>)}</div>
        {action&&<div className="bt-action-review">
         <div><span className="bt-eyebrow">PROPOSED EXTERNAL EFFECT</span><h3>{action.operation.replaceAll("_"," ")}</h3>
          <div className="bt-meta-row"><span>Target</span><strong>{action.provider==="workspace"?"Workspace record":action.provider+" · "+(action.document?.account||"Connected account")}</strong></div>
          {action.document?.proposal?.to&&<div className="bt-meta-row"><span>To</span><strong>{action.document.proposal.to}</strong></div>}
          {action.document?.proposal?.start&&<div className="bt-meta-row"><span>Starts (local time)</span><strong>{pretty(action.document.proposal.start)}</strong></div>}
          {action.document?.proposal?.end&&<div className="bt-meta-row"><span>Ends (local time)</span><strong>{pretty(action.document.proposal.end)}</strong></div>}
          {action.document?.proposal?.destinationId&&<div className="bt-meta-row"><span>Destination ID</span><strong>{action.document.proposal.destinationId}</strong></div>}
          <div className="bt-meta-row"><span>Risk</span><strong>{action.document?.risk||"Unclassified"}</strong></div>
         </div>
         <div className="bt-preview"><span className="bt-eyebrow">EXACT APPROVED CONTENT</span><h3>{action.document?.proposal?.subject||"No subject"}</h3>
          <pre>{action.document?.proposal?.body||""}</pre></div>
        </div>}
        <div className="bt-review-section approval-backdrop">
         <section className="approval-paper" aria-label="Ordered approvals">
          <div className="approval-title"><span className="approval-icon"><Clock3 size={19}/></span><div>
           <h2>{selected.status==="awaiting_approval"&&nextReviewer?nextReviewer.reviewer_id===userId?"Waiting on your review":`${displayName(nextReviewer.reviewer_id)} is up next`:statusNames[selected.status]||"Review sequence"}</h2>
           <p>{selectedDecisions.filter(d=>d.decision==="approved").length} of {selectedSteps.length} approved</p>
          </div></div>
          <details open className="bt-ordered-approval">
           <summary className="ordered-label">Review in order</summary>
           <div className="reviewer-list">
            {selectedSteps.map((step,i)=>{
             const decision=selectedDecisions.find(d=>d.position===step.position);
             const active=selected.status==="awaiting_approval"&&nextReviewer?.position===step.position;
             const name=displayName(step.reviewer_id);
             const label=decision?{approved:"Approved",rejected:"Rejected",changes_requested:"Changes requested"}[decision.decision]:active?"Awaiting review":selected.status==="awaiting_approval"?"Waiting in order":"Closed";
             return <div key={step.position} className={"reviewer-row"+(active?" active":"")}>
              <span className={`avatar avatar-${i%4}`} aria-hidden="true">{name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase()}</span>
              <div className="reviewer-info"><div><b>{name}</b><small>{members.find(m=>m.user_id===step.reviewer_id)?.role||"Reviewer"}</small></div>
               {decision&&<p>{decision.comment||pretty(decision.created_at)}</p>}</div>
              <span className={"status-tag "+(decision?.decision==="approved"?"green":decision?.decision==="rejected"?"red":active?"amber":"neutral")}>
               {label} {decision?.decision==="approved"?<Check size={12}/>:active?<Clock3 size={12}/>:null}</span>
             </div>;
            })}
           </div>
          </details>
          {selected.status==="awaiting_approval"&&nextReviewer?.reviewer_id===userId&&
           <ReviewButtons busy={saving} onDecide={(choice,note)=>decide(selected,choice,note)}/>}
         </section>
        </div>
        <div className="bt-revision-action"><button className="bt-secondary" onClick={()=>{setMapFlow(selected.id);chooseView("map");}}>Inspect on map <ArrowRight size={15}/></button></div>
        {selected.status==="approved"&&selected.created_by===userId&&
         <div className="bt-execute-box"><div><strong>Approved. Ready for execution.</strong><p>The server will re-check permissions, policy and the exact workflow version.</p></div>
          <button className="bt-primary" disabled={saving} onClick={()=>setConfirmExecute(selected.id)}>Execute action <ArrowRight size={17}/></button></div>}
        {selected.created_by===userId&&["awaiting_approval","changes_requested","rejected","approved","failed"].includes(selected.status)&&
         <div className="bt-revision-action"><button className="bt-secondary" onClick={()=>reviseWorkflow(selected)}>Revise this proposal <ArrowRight size={15}/></button>
          {selected.status!=="failed"&&<button className="bt-secondary" disabled={saving} onClick={()=>void cancelWorkflow(selected.id)}>Cancel workflow</button>}
          <span>Revisions create a new version and invalidate all previous approvals.</span></div>}
        {selected.status==="completed"&&<div className="bt-success">Completed. The verified outcome appears in the audit ledger.</div>}
        {selected.status==="needs_verification"&&<div className="bt-alert">The provider outcome is uncertain. Do not repeat this operation until its result is checked.</div>}
       </section>
      </>}
      {view==="approvals"&&<section className="bt-card"><div className="bt-card-header"><div><div className="bt-eyebrow">ASSIGNED TO YOU</div><h2>Approval inbox</h2></div><span className="bt-record-id">{mine.length} pending</span></div>
       {mine.length?mine.map(f=><button className="bt-flow-line" key={f.id} onClick={()=>{setView("workflows");setSelectedFlow(f.id);}}><span className="bt-flow-icon"><Inbox size={18}/></span><span><strong>{f.title}</strong><small>{pretty(f.created_at)}</small></span><Status value={f.status}/><ChevronRight size={16}/></button>):
       <div className="bt-empty in-card"><CheckCircle2 size={27}/><strong>You’re all caught up.</strong><span>Requests assigned to you appear here automatically.</span></div>}
       {notifications.filter(n=>!n.read_at).map(n=><div className="bt-notice-row" key={n.id}>{n.message}<button onClick={()=>markNotification(n.id)}>Mark read <Check size={14}/></button></div>)}
      </section>}
      {view==="records"&&<section className="bt-card"><div className="bt-card-header"><div><div className="bt-eyebrow">PERSISTED IN SUPABASE</div><h2>Saved workspace records</h2></div><span className="bt-record-id">{records.length} records</span></div>
       {records.length?records.map(r=><details className="bt-record" key={r.id}><summary><FileText size={18}/><strong>{r.title}</strong><small>{pretty(r.created_at)}</small><ChevronDown size={16}/></summary><pre>{r.body}</pre></details>):
       <div className="bt-empty in-card"><FileText size={26}/><strong>No saved records yet.</strong><span>Approved workspace actions produce verifiable records here.</span></div>}
      </section>}
      {view==="records"&&<section className="bt-card bt-attachments">
       <div className="bt-card-header"><div><div className="bt-eyebrow">PRIVATE WORKSPACE STORAGE</div><h2>Shared documents</h2>
        <p>Uploaded files are private to authorized workspace members. Maximum 10 MB per file.</p></div>
        <label className="bt-secondary bt-upload-label">Upload document
         <input type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.docx" disabled={uploading}
          onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void uploadAttachment(file)}}/>
        </label>
       </div>
       {uploading&&<div className="bt-upload-progress" role="status">Uploading document securely…</div>}
       {attachments.length?attachments.map(a=><div className="bt-attachment-row" key={a.id}>
        <span className="bt-flow-icon"><FileText size={17}/></span>
        <span className="bt-attachment-title"><strong>{a.filename}</strong><small>{(a.byte_size/1024).toFixed(1)} KB · {pretty(a.created_at)}</small></span>
        <button className="bt-secondary" onClick={()=>void openAttachment(a)}>Open <ExternalLink size={14}/></button>
        {(a.uploader_id===userId||isAdmin)&&<button className="bt-attachment-delete" disabled={saving} aria-label={"Delete "+a.filename} onClick={()=>void deleteAttachment(a)}><X size={16}/></button>}
       </div>):<div className="bt-empty in-card"><FolderClosed size={24}/><strong>No workspace files.</strong><span>Upload an authorized document to share it with your team.</span></div>}
      </section>}
      {view==="integrations"&&<section className="bt-integrations">
       {([{provider:"gmail" as const,title:"Gmail",detail:"Send approved messages from your connected account.",icon:Mail},
         {provider:"calendar" as const,title:"Google Calendar",detail:"Create approved events and verify their IDs.",icon:CalendarDays},
         {provider:"drive" as const,title:"Google Drive",detail:"Move authorized files after approval and verify their destination.",icon:FolderClosed}]).map(item=>{
         const c=connected(item.provider),Icon=item.icon;
         return <div className="bt-connector" key={item.provider}>
          <div className="bt-connector-icon"><Icon size={25} strokeWidth={1.6}/></div>
          <div className="bt-connector-main"><h2>{item.title}</h2><p>{item.detail}</p>
           {c?<div className="bt-connected"><CheckCircle2 size={15}/> Connected: {c.account}</div>:
            <small>{config.google?"Account authorization required.":"Google OAuth client credentials are not yet configured."}</small>}</div>
          {c?<button className="bt-secondary" disabled={saving} onClick={()=>void disconnect(item.provider)}>Disconnect <X size={15}/></button>:
           <a className={"bt-secondary"+(!config.google?" bt-disabled":"")} aria-disabled={!config.google} onClick={e=>{if(!config.google)e.preventDefault()}}
            href={"/api/integrations/google/start?provider="+item.provider+"&workspace="+encodeURIComponent(workspaceId)}>Connect <ArrowUpRight size={15}/></a>}
         </div>;
       })}
       <div className="bt-info"><LockKeyhole size={18}/><span>Credentials are encrypted on the server and never exposed to your browser. Only an approved and authorized workflow can use a connected service.</span></div>
      </section>}
      {view==="policies"&&policy&&<section className="bt-card bt-policy-panel"><div className="bt-card-header"><div><div className="bt-eyebrow">SERVER-ENFORCED</div><h2>Workspace policies</h2></div><span className="bt-status blue">Active</span></div>
       {([{key:"allow_send",title:"Allow approved email sending",detail:"When off, even fully approved email sends are blocked."},
          {key:"allow_calendar",title:"Allow calendar operations",detail:"Control creation and changes to calendar events."},
          {key:"allow_drive",title:"Allow Drive operations",detail:"Require an approved and authorized account for file changes."},
          {key:"allow_self_approval",title:"Allow self-approval",detail:"If off, workflow creators need another authorized reviewer."}] as const).map(rule=>
        <label key={rule.key} className="bt-policy-line"><span><strong>{rule.title}</strong><small>{rule.detail}</small></span>
         <input aria-label={rule.title} type="checkbox" role="switch" disabled={!isAdmin||saving} checked={policy[rule.key]}
           onChange={e=>void updatePolicies({...policy,[rule.key]:e.target.checked})}/></label>)}
       {!isAdmin&&<p className="bt-muted">Only workspace administrators can change policies.</p>}
      </section>}
      {view==="audit"&&<section className="bt-card"><div className="bt-card-header"><div><div className="bt-eyebrow">APPEND-ONLY EVENT HISTORY</div><h2>Audit ledger</h2><p>Up to 100 recent events</p></div>
       <button className="bt-secondary" disabled={saving} onClick={()=>void downloadAudit()}><Download size={15}/> Export audit</button></div>
       {audit.length?audit.map(entry=><details className="bt-audit-event" key={entry.id}><summary className="bt-audit-line"><span className="bt-audit-icon"><Activity size={16}/></span><div><strong>{entry.event.replaceAll("."," / ").replaceAll("_"," ")}</strong>
        <small>{entry.workflow_id?"Workflow "+idLabel(entry.workflow_id):"Workspace event"}</small></div><time>{pretty(entry.created_at)}</time><ChevronDown size={15}/></summary>
        <dl>{Object.keys(entry.detail).length?Object.entries(entry.detail).map(([key,value])=><div key={key}><dt>{key.replaceAll("_"," ")}</dt><dd>{String(value??"—")}</dd></div>):<div><dt>Event</dt><dd>{entry.event}</dd></div>}</dl></details>):
       <div className="bt-empty in-card"><Activity size={24}/><strong>No activity yet.</strong></div>}
      </section>}
      {view==="team"&&<>
       <section className="bt-card"><div className="bt-card-header"><div><div className="bt-eyebrow">MEMBERSHIP</div><h2>People in this workspace</h2></div><span className="bt-record-id">{members.length} people</span></div>
        {members.map(m=><div className="bt-person-line" key={m.user_id}><span className="bt-person-avatar">{displayName(m.user_id).slice(0,2).toUpperCase()}</span>
          <span><strong>{displayName(m.user_id)}</strong><small>{m.user_id===userId?"You":"Member"}</small></span><span className="bt-role">{m.role}</span></div>)}
       </section>
       {isAdmin&&<section className="bt-card bt-invite-panel"><div className="bt-eyebrow">INVITE A COLLEAGUE</div><h2>Add a reviewer</h2><p>Choose the recipient’s existing username. Only that account can accept the invitation.</p>
        <form className="bt-inline-form" onSubmit={invite}><label>Username<input required value={teamUsername} onChange={e=>setTeamUsername(e.target.value)} placeholder="colleague_username"/></label>
         <label>Role<select value={teamRole} onChange={e=>setTeamRole(e.target.value)}><option value="reviewer">Reviewer</option><option value="admin">Admin</option><option value="member">Member</option></select></label>
         <button className="bt-primary" disabled={saving}>Create invitation</button></form>
        {inviteLink&&<div className="bt-invite-link"><input readOnly aria-label="Invitation URL" value={inviteLink} onFocus={e=>e.currentTarget.select()}/>
         <button onClick={()=>{navigator.clipboard.writeText(inviteLink);announce("Invitation copied.");}}><Copy size={16}/> Copy link</button></div>}
       </section>}
      </>}
      {view==="settings"&&<section className="bt-card bt-settings"><div className="bt-eyebrow">IDENTITY</div><h2>Your profile</h2><p>Username {username}</p>
       <form className="bt-inline-form" onSubmit={saveProfile}><label>Display name<input required minLength={1} maxLength={80} value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Your name"/></label>
        <button disabled={saving} className="bt-primary">Save profile</button></form>
       <div className="bt-settings-footer"><span><LockKeyhole size={17}/> Secure authentication session</span><button className="bt-secondary" onClick={logOut}><LogOut size={15}/> Sign out</button></div>
      </section>}
     </>}
     <footer className="bt-foot"><span>BEFORE THE CLICK</span><span>Every decision has a record.</span><Link href="/">Home <ArrowUpRight size={13}/></Link></footer>
    </main>
   </div>
   {notice&&<div role={notice.bad?"alert":"status"} className={"bt-toast"+(notice.bad?" error":"")}><span>{notice.bad?<AlertTriangle size={17}/>:<CheckCircle2 size={17}/>}</span>{notice.text}<button onClick={()=>setNotice(null)} aria-label="Dismiss"><X size={15}/></button></div>}
   {createWorkspace&&<Modal onClose={()=>setCreateWorkspace(false)} title="New workspace" eyebrow="START SOMETHING ACCOUNTABLE"><p>Each workspace has its own members, approvals and audit history.</p>
    <form className="bt-form" onSubmit={newWorkspace}><label>Workspace name<input required minLength={2} maxLength={100} autoFocus value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)} placeholder="Your organization or team"/></label>
    <div className="bt-modal-actions"><button type="button" className="bt-secondary" onClick={()=>setCreateWorkspace(false)}>Cancel</button><button className="bt-primary" disabled={saving}>Create workspace <ArrowRight size={16}/></button></div></form></Modal>}
   {createFlow&&<Modal onClose={()=>{setCreateFlow(false);setEditingId(null)}} title={editingId?"Revise this action":"Propose an action"} eyebrow={editingId?"NEW VERSION":"NEW WORKFLOW"} wide>
    <form className="bt-form bt-composer" onSubmit={sendProposal}>
     <div className="bt-composer-grid"><label>Workflow title<input required maxLength={100} minLength={3} value={composer.title} onChange={e=>setComposer(c=>({...c,title:e.target.value}))} placeholder="Prepare weekly status update"/></label>
      <label>Action type<select value={composer.provider} onChange={e=>setComposer(c=>({...c,provider:e.target.value as Provider,account:""}))}>
       <option value="workspace">Save a workspace record</option><option value="gmail" disabled={!connected("gmail")}>Send approved Gmail message</option>
       <option value="calendar" disabled={!connected("calendar")}>Create Google Calendar event</option><option value="drive" disabled={!connected("drive")}>Move a Google Drive file</option>
      </select></label></div>
     <label>What should happen?<textarea required rows={3} maxLength={1200} value={composer.objective}
       onChange={e=>setComposer(c=>({...c,objective:e.target.value}))} placeholder="Describe the task and the desired outcome clearly."/></label>
     <div className="bt-composer-divider"><span className="bt-eyebrow">PROPOSED RESULT</span>
      {config.gemini&&config.openrouter&&<select aria-label="Draft provider" value={draftProvider} onChange={e=>setDraftProvider(e.target.value as "auto"|"openrouter")}>
       <option value="auto">Automatic</option><option value="openrouter">OpenRouter</option>
      </select>}
      <button type="button" className="bt-ai-button" disabled={drafting||composer.sensitive||composer.objective.trim().length<8||(!config.gemini&&!config.openrouter)}
        onClick={composeWithAI}><Sparkles size={15}/>{drafting?"Drafting…":"Draft with AI"}</button></div>
     {composer.provider!=="workspace"&&<label>Authorized account<select required value={composer.account} onChange={e=>setComposer(c=>({...c,account:e.target.value}))}>
       <option value="">Choose connected account</option>{connections.filter(c=>c.provider===composer.provider&&c.owner_id===userId).map(c=>
        <option key={c.id} value={c.account}>{c.account}</option>)}</select></label>}
     {composer.provider!=="workspace"&&composer.account&&<ResourceBrowser workspace={workspaceId} provider={composer.provider} account={composer.account}
       onSelect={(item,mode)=>{
        if(composer.provider==="gmail"){
         const address=extractEmailAddress(String(item.from||""));
         if(!address){announce("The sender address could not be verified.",true);return;}
         setComposer(c=>({...c,to:address,subject:"Re: "+String(item.subject||"").replace(/^Re:\s*/i,"")}));
         announce("Sender and subject selected. Review the content before submitting.");
        }else if(composer.provider==="drive"){
         if(!item.id)return;
         setComposer(c=>({...c,[mode==="destination"?"destinationId":"fileId"]:String(item.id)}));
         announce(mode==="destination"?"Destination folder selected.":"Drive file selected.");
        }else{
         setComposer(c=>({...c,subject:String(item.title||""),objective:c.objective||"Create a new event referencing this calendar entry."}));
         announce("Calendar reference selected. Confirm the new event time.");
        }
       }}/> }
     {composer.provider==="gmail"&&<label>Recipient email<input required type="email" value={composer.to} onChange={e=>setComposer(c=>({...c,to:e.target.value}))} placeholder="recipient@example.com"/></label>}
     {composer.provider==="calendar"&&<div className="bt-composer-grid"><label>Start date / time<input required type="datetime-local" value={composer.start} onChange={e=>setComposer(c=>({...c,start:e.target.value}))}/></label>
      <label>End date / time<input required type="datetime-local" value={composer.end} onChange={e=>setComposer(c=>({...c,end:e.target.value}))}/></label></div>}
     {composer.provider==="drive"&&<div className="bt-composer-grid"><label>File ID<input required value={composer.fileId} onChange={e=>setComposer(c=>({...c,fileId:e.target.value}))}/></label>
      <label>Destination folder ID<input required value={composer.destinationId} onChange={e=>setComposer(c=>({...c,destinationId:e.target.value}))}/></label></div>}
     <label>{composer.provider==="gmail"?"Email subject":composer.provider==="calendar"?"Event title":composer.provider==="drive"?"File change summary":"Record title"}
       <input required maxLength={composer.provider==="workspace"?200:250} value={composer.subject} onChange={e=>setComposer(c=>({...c,subject:e.target.value}))} placeholder="Exact proposed title"/></label>
     <label>{composer.provider==="gmail"?"Email body":"Full proposed content"}
      <textarea required rows={6} maxLength={composer.provider==="workspace"?10000:12000} value={composer.body} onChange={e=>setComposer(c=>({...c,body:e.target.value}))} placeholder="The exact content reviewers will approve."/></label>
     <div className="bt-approval-picker"><div className="bt-eyebrow">REVIEWERS · IN ORDER</div><p>Choose the people who must approve this exact version.</p>
      {assignedReviewers.map(m=><label key={m.user_id} className="bt-check-row"><input type="checkbox" checked={composer.reviewers.includes(m.user_id)}
       onChange={e=>setComposer(c=>({...c,reviewers:e.target.checked?[...c.reviewers,m.user_id]:c.reviewers.filter(id=>id!==m.user_id)}))}/><span>{composer.reviewers.includes(m.user_id)&&`${composer.reviewers.indexOf(m.user_id)+1}. `}{displayName(m.user_id)} <small>{m.role}</small></span></label>)}
      {!assignedReviewers.length&&<div className="bt-alert">Add an authorized reviewer in Team before submitting.</div>}
     </div>
     <label className="bt-check-row"><input type="checkbox" checked={composer.sensitive} onChange={e=>setComposer(c=>({...c,sensitive:e.target.checked}))}/> Contains sensitive information. Prevent execution under default policy.</label>
     <div className="bt-modal-actions"><button type="button" className="bt-secondary" onClick={()=>setCreateFlow(false)}>Cancel</button>
      <button className="bt-primary" disabled={saving||!composer.reviewers.length}>{editingId?"Submit revised version":"Submit for approval"} <ArrowRight size={16}/></button></div>
    </form></Modal>}
   {confirmExecute&&<Modal onClose={()=>setConfirmExecute(null)} title="Execute approved action?" eyebrow="FINAL CONFIRMATION">
    <p>The server will enforce the latest policies and approvals. External actions can affect real accounts and may not be reversible.</p>
    <div className="bt-modal-actions"><button className="bt-secondary" onClick={()=>setConfirmExecute(null)}>Go back</button>
     <button className="bt-primary" disabled={saving} onClick={()=>execute(confirmExecute)}>Execute now <ArrowRight size={16}/></button></div>
   </Modal>}
 </div>;
}

function Modal({children,onClose,title,eyebrow,wide=false}:{children:React.ReactNode;onClose:()=>void;title:string;eyebrow:string;wide?:boolean}){
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose()};window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey)},[onClose]);
 return <div className="bt-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section className={"bt-modal"+(wide?" wide":"")} role="dialog" aria-modal="true" aria-label={title}>
   <button className="bt-modal-close" aria-label="Close dialog" onClick={onClose}><X size={20}/></button>
   <span className="bt-eyebrow">{eyebrow}</span><h2>{title}</h2>{children}
  </section></div>;
}
function ReviewButtons({busy,onDecide}:{busy:boolean;onDecide:(choice:"approved"|"rejected"|"changes_requested",note:string)=>void}){
 const [choice,setChoice]=useState<"rejected"|"changes_requested"|null>(null),[note,setNote]=useState("");
 return <div className="bt-decision-bar">
  <div><strong>Your review is needed.</strong><p>Only your explicit decision is recorded. Inspect the exact proposed content above.</p></div>
  {!choice?<div className="bt-button-group">
   <button className="bt-secondary" disabled={busy} onClick={()=>setChoice("changes_requested")}>Request changes</button>
   <button className="bt-secondary" disabled={busy} onClick={()=>setChoice("rejected")}>Reject</button>
   <button className="bt-primary" disabled={busy} onClick={()=>onDecide("approved","")}>Approve exact version <Check size={16}/></button>
  </div>:<div className="bt-reason"><textarea autoFocus required maxLength={500} placeholder="Explain what must change or why this cannot proceed." value={note} onChange={e=>setNote(e.target.value)}/>
   <button className="bt-secondary" onClick={()=>setChoice(null)}>Cancel</button><button className="bt-primary" disabled={!note.trim()||busy} onClick={()=>{onDecide(choice,note);setChoice(null);}}>Submit decision</button></div>}
 </div>;
}
