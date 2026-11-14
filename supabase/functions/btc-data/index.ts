import postgres from "npm:postgres@3.4.7";

const sql=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:2,idle_timeout:10});
const encoder=new TextEncoder();
const hex=(v:ArrayBuffer)=>Array.from(new Uint8Array(v),b=>b.toString(16).padStart(2,"0")).join("");
const bytes=(s:string)=>Uint8Array.from(s.match(/.{2}/g)||[],p=>parseInt(p,16));
const decode=(text:string)=>JSON.parse(text);
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const hash=/^[a-f0-9]{64}$/;
type Input=Record<string,string|boolean|number|null>;
type Tx=postgres.TransactionSql;

class Failure extends Error {
  constructor(readonly status:number,message:string){super(message);}
}
const one=<T>(rows:T[])=>rows[0]||null;

async function identity(db:Tx,token:string){
  if(!hash.test(token||""))return null;
  const key=hex(await crypto.subtle.digest("SHA-256",encoder.encode(token)));
  return one(await db`select a.id,a.username,p.display_name as name from btc_private.account_sessions s
    join btc_private.accounts a on a.id=s.account_id join public.profiles p on p.id=a.id
    where s.digest=${key} and s.expires_at>now() for share of s`);
}

async function account(db:Tx,action:string,p:Input){
  if(action==="signup"){
    const inserted=one(await db`insert into btc_private.accounts(username,password_hash,recovery_hash)
      values(${p.username},${p.passwordHash},${p.recoveryHash}) on conflict(username) do nothing returning id,username`);
    if(!inserted)throw new Failure(409,"That username is already taken.");
    await db`insert into public.profiles(id,display_name) values(${inserted.id},${p.name})`;
    await db`insert into btc_private.account_sessions(digest,account_id) values(${p.token},${inserted.id})`;
    return inserted;
  }
  if(action==="login") return one(await db`select id,password_hash from btc_private.accounts where username=${p.username}`);
  if(action==="issue"){
    const owner=one(await db`select id from btc_private.accounts where id=${p.id} and password_hash=${p.expectedHash} for update`);
    if(!owner)throw new Failure(401,"The username or password is incorrect.");
    await db`delete from btc_private.account_sessions where account_id=${owner.id} and expires_at<=now()`;
    await db`insert into btc_private.account_sessions(digest,account_id) values(${p.token},${owner.id})`;
    return {ok:true};
  }
  const owner=one(await db`update btc_private.accounts set password_hash=${p.passwordHash},recovery_hash=${p.recoveryHash}
    where username=${p.username} and recovery_hash=${p.previousRecovery} returning id`);
  if(!owner)throw new Failure(401,"The username or recovery code is incorrect.");
  await db`delete from btc_private.account_sessions where account_id=${owner.id}`;
  await db`insert into btc_private.account_sessions(digest,account_id) values(${p.token},${owner.id})`;
  return {ok:true};
}

async function storage(method:string,path:string,body:unknown){
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!service)throw new Failure(503,"File storage is unavailable.");
  const response=await fetch(Deno.env.get("SUPABASE_URL")+"/storage/v1"+path,{
    method,headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},
    body:JSON.stringify(body),signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)throw new Failure(503,"File storage could not complete that request.");
  return response.json();
}

async function data(db:Tx,action:string,p:Input,id:string){
  if(action==="workspaces"){
    const memberships=await db`select workspace_id,user_id,role from public.workspace_members where user_id=${id}`;
    const workspaces=await db`select id,name,owner_id,created_at from public.workspaces
      where id in (select workspace_id from public.workspace_members where user_id=${id}) order by name`;
    return {memberships,workspaces};
  }
  if(action==="snapshot"){
    const w=p.workspace;
    if(!uuid.test(String(w)))throw new Failure(400,"Choose a workspace.");
    const [access]=await db`select public.btc_is_member(${w}) as allowed`;
    if(!access.allowed)throw new Failure(404,"Workspace not found.");
    const [flows,members,connections,policies,audit,records,attachments,notifications,people,versions,actions,steps,decisions]=await Promise.all([
      db`select * from public.workflows where workspace_id=${w} order by created_at desc`,
      db`select workspace_id,user_id,role from public.workspace_members where workspace_id=${w}`,
      db`select id,provider,account,connected_at,owner_id from public.integrations where workspace_id=${w}`,
      db`select * from public.policy_rules where workspace_id=${w}`,
      db`select id,event,detail,created_at,workflow_id from public.audit_events where workspace_id=${w} order by id desc limit 100`,
      db`select id,title,body,created_at from public.workspace_records where workspace_id=${w} order by created_at desc limit 100`,
      db`select * from public.attachments where workspace_id=${w} order by created_at desc limit 100`,
      db`select id,message,read_at from public.notifications where workspace_id=${w} and user_id=${id} order by id desc limit 30`,
      db`select id,display_name from public.profiles where id in (select user_id from public.workspace_members where workspace_id=${w})`,
      db`select v.* from public.workflow_versions v join public.workflows f on f.id=v.workflow_id where f.workspace_id=${w} and v.version=f.current_version`,
      db`select a.* from public.proposed_actions a join public.workflow_versions v on a.version_id=v.id join public.workflows f on v.workflow_id=f.id where f.workspace_id=${w} and v.version=f.current_version`,
      db`select s.* from public.approval_steps s join public.workflow_versions v on s.version_id=v.id join public.workflows f on v.workflow_id=f.id where f.workspace_id=${w} and v.version=f.current_version`,
      db`select d.* from public.approval_decisions d join public.workflow_versions v on d.version_id=v.id join public.workflows f on v.workflow_id=f.id where f.workspace_id=${w} and v.version=f.current_version`
    ]);
    return {flows,members,connections,policy:one(policies),audit,records,attachments,notifications,people,versions,actions,steps,decisions};
  }
  if(action==="member")return one(await db`select role from public.workspace_members where workspace_id=${p.workspace} and user_id=${id}`);
  if(action==="workflow")return one(await db`select id,workspace_id,created_by,current_version,status from public.workflows where id=${p.id}`);
  if(action==="version")return one(await db`select id,version from public.workflow_versions where workflow_id=${p.workflow} and version=${p.version}`);
  if(action==="proposal")return one(await db`select provider,operation,resource_id,document from public.proposed_actions where version_id=${p.version}`);
  if(action==="record")return one(await db`select id,title,body,created_at from public.workspace_records where id=${p.id} and workspace_id=${p.workspace}`);
  if(action==="btc_workspace")return (await db`select public.btc_workspace(${p.name}) as value`)[0].value;
  if(action==="btc_profile")return (await db`select public.btc_profile(${p.name}) as value`)[0].value;
  if(action==="btc_join")return (await db`select public.btc_join(${p.d}) as value`)[0].value;
  if(action==="btc_cancel")return (await db`select public.btc_cancel(${p.f}) as value`)[0].value;
  if(action==="btc_decide")return (await db`select public.btc_decide(${p.f},${p.v},${p.d},${p.note}) as value`)[0].value;
  if(action==="btc_policies")return (await db`select public.btc_policies(${p.w},${p.sending},${p.calendar},${p.drive},${p.self_approval}) as value`)[0].value;
  if(action==="btc_invite")return (await db`select public.btc_invite(${p.w},${p.address},${p.member_role},${p.digest}) as value`)[0].value;
  if(action==="btc_notification")return (await db`select public.btc_notification(${p.n}) as value`)[0].value;
  if(action==="btc_export_audit")return (await db`select public.btc_export_audit(${p.w}) as value`)[0].value;
  if(action==="btc_connection")return (await db`select public.btc_connection(${p.payload},${p.signature}) as value`)[0].value;
  if(action==="btc_propose")return (await db`select public.btc_propose(${p.payload},${p.signature}) as value`)[0].value;
  if(action==="btc_execution")return (await db`select public.btc_execution(${p.payload},${p.signature}) as value`)[0].value;
  if(action==="btc_publish_record")return (await db`select public.btc_publish_record(${p.payload},${p.signature}) as value`)[0].value;
  if(action==="file_upload"){
    const [grant]=await db`select public.btc_is_member(${p.workspace}) as allowed`;
    if(!grant.allowed)throw new Failure(404,"Workspace not found.");
    const path=p.workspace+"/"+id+"/"+crypto.randomUUID();
    const upload=await storage("POST","/object/upload/sign/btc-workspace-files/"+path,{});
    const token=new URL(upload.url,"https://example.invalid").searchParams.get("token");
    if(!token)throw new Failure(503,"File storage could not create an upload link.");
    return {path,token};
  }
  if(action==="file_add"){
    const path=String(p.path);
    if(!path.startsWith(p.workspace+"/"+id+"/")||!uuid.test(path.split("/").at(-1)||""))
      throw new Failure(404,"File not found.");
    const [object]=await db`select metadata from storage.objects where bucket_id='btc-workspace-files' and name=${path}`;
    if(!object||Number(object.metadata?.size)!==p.size||object.metadata?.mimetype!==p.mime)
      throw new Failure(400,"The uploaded file could not be verified.");
    return one(await db`insert into public.attachments(workspace_id,uploader_id,object_path,filename,mime_type,byte_size)
      values(${p.workspace},${id},${p.path},${p.filename},${p.mime},${p.size}) returning id`);
  }
  if(action==="file_read"||action==="file_remove"){
    const [file]=await db`select a.*,public.btc_is_admin(a.workspace_id) as admin from public.attachments a where a.id=${p.id}`;
    if(!file||(action==="file_remove"&&file.uploader_id!==id&&!file.admin))throw new Failure(404,"File not found.");
    if(action==="file_remove"){
      await storage("DELETE","/object/btc-workspace-files",{prefixes:[file.object_path]});
      await db`delete from public.attachments where id=${p.id}`;
      return {ok:true};
    }
    const result=await storage("POST","/object/sign/btc-workspace-files/"+file.object_path,{expiresIn:60});
    return {signedPath:result.signedURL,filename:file.filename};
  }
  throw new Failure(400,"Unknown operation.");
}

Deno.serve(async request=>{
  if(request.method!=="POST")return reply({message:"Method not allowed."},405);
  const signature=request.headers.get("x-btc-signature")||"";
  if(!hash.test(signature))return reply({message:"Authorization required."},401);
  try{
    const body=await request.text();
    if(body.length>100_000)throw new Failure(413,"Request too large.");
    const [config]=await sql`select secret from btc_private.server_configuration where singleton`;
    if(!config)throw new Failure(503,"Account storage is unavailable.");
    const key=await crypto.subtle.importKey("raw",encoder.encode(config.secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
    if(!await crypto.subtle.verify("HMAC",key,bytes(signature),encoder.encode("btc-data:"+body)))
      throw new Failure(401,"Authorization required.");
    const {action,input={},session,expires}=decode(body);
    if(!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+30_000)throw new Failure(401,"Request expired.");
    const result=await sql.begin(async db=>{
      if(["signup","login","issue","reset"].includes(action))return account(db,action,input);
      if(action==="logout"){
        if(hash.test(session||""))await db`delete from btc_private.account_sessions where digest=${hex(await crypto.subtle.digest("SHA-256",encoder.encode(session)))}`;
        return {ok:true};
      }
      const owner=await identity(db,session);
      if(action==="session")return owner;
      if(!owner)throw new Failure(401,"Sign in first.");
      await db`select set_config('request.jwt.claims',${JSON.stringify({sub:owner.id,role:"authenticated",user_metadata:{name:owner.name}})},true)`;
      await db`set local role authenticated`;
      return data(db,action,input,owner.id);
    });
    return reply(result??null);
  }catch(error){
    if(error instanceof Failure)return reply({message:error.message},error.status);
    const databaseError=error as {code?:string;message?:string;name?:string};
    if(databaseError?.code&&["P0001","42501","23514","23505","22P02"].includes(databaseError.code)){
      const message=databaseError.code==="P0001"?databaseError.message:"The requested operation could not be completed.";
      return reply({message},400);
    }
    console.error("Storage operation failed",databaseError?.code||databaseError?.name||"unknown");
    return reply({message:"Account storage is unavailable."},503);
  }
});
