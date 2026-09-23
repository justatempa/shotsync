// Storage abstraction replacing the Cloudflare R2 binding. Keys are flat
// ("full/<id>.<ext>", "thumb/<id>.jpg"); listing is sorted by key, which —
// because the id embeds a zero-padded inverted timestamp — means newest first.
export interface StoredObject {
  key: string;
  contentType: string;
  size: number;
  metadata: Record<string, string>;
  body: ReadableStream;
  text(): Promise<string>;
}

export interface ListedObject {
  key: string;
  contentType: string;
  metadata: Record<string, string>;
}

export interface ListResult {
  objects: ListedObject[];
  truncated: boolean;
  cursor: string | null;
}

export interface PutOptions {
  contentType: string;
  metadata?: Record<string, string>;
}

export interface Storage {
  put(key: string, data: ReadableStream | Uint8Array, opts: PutOptions): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(keys: string[]): Promise<void>;
  list(opts: { prefix: string; limit: number; cursor?: string }): Promise<ListResult>;
}
