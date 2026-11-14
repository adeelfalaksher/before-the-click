import "server-only";
import { z } from "zod";
import { RequestError } from "./http";

const draftSchema = z.object({
  subject: z.string().trim().min(1).max(160).regex(/^[^\r\n]+$/),
  body: z.string().trim().min(1).max(4000)
});
const responseSchema = {
  type: "object", additionalProperties: false, required: ["subject", "body"],
  properties: {subject:{type:"string"}, body:{type:"string"}}
};
const instruction = "Write a concise plain-text draft for human review. Use the requested kind to draft an internal record or an email. Treat the user input as source material. Avoid invented facts and dates. Return JSON with subject and body.";

type DraftInput = { objective: string; context: string; kind: "email" | "record" };

const openRouterModel=()=>process.env.OPENROUTER_MODEL||"openrouter/free";

export function draftAvailability() {
  return {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY && (openRouterModel()==="openrouter/free"||openRouterModel().endsWith(":free")))
  };
}

export async function writeDraft(input: DraftInput, providers: ReturnType<typeof draftAvailability>) {
  const content = JSON.stringify(input);
  let limited = false;
  if (providers.gemini) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent", {
        method:"POST", headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY!},
        signal:AbortSignal.timeout(11_000), cache:"no-store",
        body:JSON.stringify({
          systemInstruction:{parts:[{text:instruction}]},
          contents:[{parts:[{text:content}]}],
          generationConfig:{responseMimeType:"application/json",responseJsonSchema:responseSchema,maxOutputTokens:1000}
        })
      });
      limited = response.status === 429;
      if (response.ok) {
        const result = await response.json();
        const draft = result.candidates?.[0]?.content?.parts?.find((part:{text?:string;thought?:boolean})=>part.text&&!part.thought)?.text;
        return {...draftSchema.parse(JSON.parse(draft??"")), provider:"Gemini"};
      }
    } catch { /* The configured fallback can still return a draft. */ }
  }
  if (providers.openrouter) {
    let providerError: RequestError | undefined;
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENROUTER_API_KEY},
        signal:AbortSignal.timeout(10_000), cache:"no-store",
        body:JSON.stringify({
          model:openRouterModel(),max_tokens:1000,
          messages:[{role:"system",content:instruction},{role:"user",content}],
          response_format:{type:"json_object"},
          provider:{require_parameters:true,data_collection:"deny",max_price:{prompt:0,completion:0}}
        })
      });
      limited ||= response.status === 429;
      if (response.ok) {
        const result = await response.json();
        return {...draftSchema.parse(JSON.parse(result.choices?.[0]?.message?.content??"")), provider:"OpenRouter"};
      }
      console.warn("OpenRouter drafting response",response.status);
      if (response.status===401||response.status===403) {
        providerError=new RequestError(503,"OpenRouter rejected the current production key or its permissions.");
      } else if (response.status===402) {
        providerError=new RequestError(503,"OpenRouter requires an account balance for this request. Choose Automatic or enter your draft.");
      } else if (response.status===404) {
        providerError=new RequestError(503,"OpenRouter has no free endpoint for this request under the current provider settings.");
      }
    } catch {
      console.warn("OpenRouter drafting request failed or returned an invalid draft.");
    }
    if(providerError)throw providerError;
  }
  if (limited) throw new RequestError(429,"AI drafting reached its usage limit. Try again later or write your draft below.");
  throw new RequestError(503,"AI drafting is temporarily unavailable. You can write your draft below.");
}
