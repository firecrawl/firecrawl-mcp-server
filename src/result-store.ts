import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  boundedPreview,
  compactJson,
  fitsBudget,
  DEFAULT_OUTPUT_TOKENS,
} from './output-budget';

const TTL_MS = 15 * 60 * 1000;
const MAX_BYTES = 64 * 1024 * 1024;
type Entry = { text: string; owner: string; bytes: number; expiresAt: number };

export class ResultStore {
  private entries = new Map<string, Entry>();
  private bytes = 0;
  constructor(
    private maxBytes = MAX_BYTES,
    private ttlMs = TTL_MS
  ) {}

  private remove(id: string, entry: Entry) {
    this.entries.delete(id);
    this.bytes -= entry.bytes;
  }

  async bound(
    text: string,
    owner: string,
    maxTokens = DEFAULT_OUTPUT_TOKENS,
    directory?: string,
    retain = true
  ): Promise<string> {
    if (fitsBudget(text, maxTokens)) return text;
    const compact = compactJson(text);
    if (fitsBudget(compact, maxTokens)) return compact;
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.remove(id, entry);
    }
    const bytes = Buffer.byteLength(compact);
    const id = randomUUID();
    let file: string | undefined;
    let fileWarning: string | undefined;
    if (directory && retain) {
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const destination = path.resolve(directory, `${id}.json`);
        await writeFile(destination, text, { flag: 'wx', mode: 0o600 });
        file = destination;
      } catch {
        fileWarning =
          'Local file output failed; use the retained result reader.';
      }
    }
    const stored = retain && bytes <= this.maxBytes;
    if (stored) {
      for (const [oldId, entry] of this.entries) {
        if (this.bytes + bytes <= this.maxBytes) break;
        this.remove(oldId, entry);
      }
      this.entries.set(id, {
        text: compact,
        owner,
        bytes,
        expiresAt: now + this.ttlMs,
      });
      this.bytes += bytes;
    }
    let shape: unknown;
    try {
      const value = JSON.parse(compact);
      shape = Array.isArray(value)
        ? { type: 'array', length: value.length }
        : value && typeof value === 'object'
          ? { type: 'object', keyCount: Object.keys(value).length }
          : undefined;
    } catch {
      /* Plain text has no JSON paths. */
    }
    return boundedPreview(compact, maxTokens, (preview) => ({
      truncated: true,
      ...(stored
        ? {
            resultId: id,
            expiresAt: new Date(now + this.ttlMs).toISOString(),
            next: {
              tool: 'firecrawl_read_result',
              arguments: {
                resultId: id,
                offset: preview.length,
                maxOutputTokens: maxTokens,
              },
            },
          }
        : {}),
      ...(file ? { file } : {}),
      fileWarning,
      totalBytes: bytes,
      totalChars: compact.length,
      shape,
      preview,
      message: stored
        ? 'Full result retained temporarily on this server. Read selected JSON paths or subsequent chunks with firecrawl_read_result; do not repeat the provider call. Save chunks using your filesystem tools if available.'
        : retain
          ? 'Result exceeds server retention capacity. Preview only; use a smaller provider page or narrower query.'
          : 'Zero Data Retention requested: full result was not retained. Preview only; narrow the request or increase maxOutputTokens.',
    }));
  }

  read(
    owner: string,
    args: {
      resultId: string;
      path?: string;
      fields?: string[];
      offset?: number;
      maxOutputTokens?: number;
    }
  ): string {
    const entry = this.entries.get(args.resultId);
    if (!entry || entry.owner !== owner || entry.expiresAt <= Date.now()) {
      if (entry && entry.expiresAt <= Date.now())
        this.remove(args.resultId, entry);
      throw new Error(
        'Result unavailable or expired on this server. The provider has not been called again.'
      );
    }
    let text = entry.text;
    if (args.path || args.fields) {
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new Error('This result is plain text; read it using offset.');
      }
      if (args.path) {
        if (!args.path.startsWith('/'))
          throw new Error(
            'path must be a JSON Pointer, for example /data/tools/0'
          );
        for (const segment of args.path.slice(1).split('/')) {
          const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
          if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
            throw new Error('JSON path not found');
          value = (value as Record<string, unknown>)[key];
        }
      }
      if (args.fields) {
        const project = (item: unknown) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? Object.fromEntries(
                args
                  .fields!.filter((key) => Object.hasOwn(item, key))
                  .map((key) => [key, (item as Record<string, unknown>)[key]])
              )
            : item;
        value = Array.isArray(value) ? value.map(project) : project(value);
      }
      text = JSON.stringify(value);
    }
    const offset = args.offset ?? 0;
    if (
      offset > text.length ||
      (offset > 0 && /[\uD800-\uDBFF]/.test(text[offset - 1]))
    )
      throw new Error('Invalid result offset');
    return boundedPreview(
      text.slice(offset),
      args.maxOutputTokens ?? DEFAULT_OUTPUT_TOKENS,
      (content) => ({
        resultId: args.resultId,
        path: args.path ?? '',
        fields: args.fields,
        offset,
        totalChars: text.length,
        content,
        truncated: offset + content.length < text.length,
        ...(offset + content.length < text.length
          ? {
              next: {
                tool: 'firecrawl_read_result',
                arguments: { ...args, offset: offset + content.length },
              },
            }
          : {}),
      })
    );
  }
}
