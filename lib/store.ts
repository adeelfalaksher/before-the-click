import { createHash } from "node:crypto";
import { BlobPreconditionFailedError, get, head, put } from "@vercel/blob";
import { RequestError } from "./http";

type Stored = { data: unknown; etag: string };
const localRecords = new Map<string, Stored>();

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
export const storeAvailable = () => configured() || process.env.NODE_ENV !== "production";

export async function readRecord<T>(path: string, forWrite = false): Promise<{ data: T; etag: string } | null> {
  if (!configured()) {
    if (!storeAvailable()) throw new RequestError(503, "Private review storage is unavailable.");
    const record = localRecords.get(path);
    return record ? { data: structuredClone(record.data) as T, etag: record.etag } : null;
  }
  const result = await get(path, { access: "private", useCache: false });
  if (result?.statusCode !== 200) return null;
  const payload = await new Response(result.stream).text();
  if (!forWrite) return { data: JSON.parse(payload) as T, etag: result.blob.etag };
  const metadata = await head(result.blob.url);
  // The write API's metadata ETag can differ from the HTTP ETag on a served blob.
  // Re-read the origin after fetching metadata so the ETag cannot authorize a stale payload.
  const latest = await get(path, { access: "private", useCache: false });
  if (latest?.statusCode !== 200 || await new Response(latest.stream).text() !== payload || !metadata.etag) {
    throw new BlobPreconditionFailedError();
  }
  return { data: JSON.parse(payload) as T, etag: metadata.etag };
}

export async function writeRecord(path: string, data: unknown, ttlDays: number, etag?: string) {
  const payload = JSON.stringify(data);
  if (configured()) {
    await put(path, payload, {
      access: "private", contentType: "application/json", addRandomSuffix: false,
      allowOverwrite: Boolean(etag), ttlDays, ...(etag ? { ifMatch: etag } : {})
    });
    return;
  }
  if (!storeAvailable()) throw new RequestError(503, "Private review storage is unavailable.");
  if (localRecords.get(path)?.etag !== etag) throw new BlobPreconditionFailedError();
  localRecords.set(path, { data: structuredClone(data), etag: hash(payload) });
}

export async function limit(request: Request, purpose: string, max: number) {
  if (!process.env.VERCEL) return;
  const ip = (request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for"))?.split(",")[0].trim() || "unknown";
  const bucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const path = "limits/" + purpose + "/" + bucket + "-" + hash(ip).slice(0, 40) + ".json";
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readRecord<{ count: number }>(path, true).catch(error => {
      if (error instanceof BlobPreconditionFailedError) return undefined;
      throw error;
    });
    if (current === undefined) continue;
    const count = current?.data.count ?? 0;
    if (count >= max) throw new RequestError(429, "This hourly limit was reached. Try again later.");
    try {
      await writeRecord(path, { count: count + 1 }, 1, current?.etag);
      return;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      if (current || !(await readRecord(path))) throw error;
    }
  }
  throw new RequestError(429, "Several requests arrived together. Try again in a moment.");
}
