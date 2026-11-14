export async function workspaceRequest<T>(action:string,input:Record<string,unknown>={}):Promise<T>{
  const response=await fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,...input})});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"The workspace request failed.");
  return result.data as T;
}
