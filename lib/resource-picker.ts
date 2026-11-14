export type GoogleResource={id?:string;from?:string;subject?:string;title?:string;mimeType?:string;snippet?:string;start?:string;end?:string;parents?:string[];[key:string]:unknown};
export function extractEmailAddress(from:string):string{
 if(/[\r\n]/.test(from))return "";
 const angle=from.match(/<([^<>]+)>/);
 const value=(angle?angle[1]:from).trim();
 return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)?value:"";
}
export function resourceName(item:GoogleResource,provider:"gmail"|"calendar"|"drive"):string{
 const title=provider==="gmail"?item.subject:item.title;
 return typeof title==="string"&&title.trim()?title.trim():(provider==="gmail"?"No subject":provider==="calendar"?"Untitled event":"Untitled file");
}
export function isDriveFolder(item:GoogleResource):boolean{
 return item.mimeType==="application/vnd.google-apps.folder";
}
