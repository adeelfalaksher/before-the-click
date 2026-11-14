import { z } from "zod";

export function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" }
  });
}

export class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>, max = 48_000): Promise<T> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new RequestError(415, "Send a JSON request.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "Missing request body.");
  const decoder = new TextDecoder();
  let bytes = 0;
  let value = "";
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > max) {
      await reader.cancel();
      throw new RequestError(413, "This request is too large.");
    }
    value += decoder.decode(part.value, { stream: true });
  }
  try {
    return schema.parse(JSON.parse(value + decoder.decode()));
  } catch {
    throw new RequestError(400, "Check the requested fields and try again.");
  }
}

export function requestError(error: unknown) {
  if (error instanceof RequestError) return reply({ error: error.message }, error.status);
  return reply({ error: "The service could not complete the request. Try again shortly." }, 503);
}
