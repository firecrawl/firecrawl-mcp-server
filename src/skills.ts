import { ProtocolError } from '@modelcontextprotocol/server';
import {
  SKILLS_EXTENSION_ID,
  SKILLS_GET_METHOD,
  SKILLS_LIST_METHOD,
  skillEntry,
  type Skill,
} from '@modelcontextprotocol/server/ext/skills';
import { z } from 'zod';
import type { McpExtension, ResourceResult } from './mcp/runtime.js';

/**
 * The Skills extension (`io.modelcontextprotocol/skills`, SEP-2640) for a
 * fixed catalog of Agent Skills. Each skill is served at
 * `skill://<path>/SKILL.md` with its files as `skill://` resources read
 * through `resources/read`; `skills/list` returns the entries in the order
 * they were given. Skill files are not added to `resources/list`.
 */

/** One skill: its folder under `skill://` and its files by path within that folder. */
export type SkillDefinition = {
  path: string;
  files: Record<string, string | Uint8Array>;
};

type SkillCatalog = {
  entries: Skill[];
  files: Map<string, ResourceResult>;
};

const CACHE_HINT = { ttlMs: 300_000, cacheScope: 'private' } as const;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function fileContent(uri: string, path: string, content: string | Uint8Array): ResourceResult {
  const mimeType = path.endsWith('.md') ? 'text/markdown' : undefined;
  let text = typeof content === 'string' ? content : undefined;
  if (text === undefined) {
    try {
      text = utf8.decode(content as Uint8Array);
    } catch {
      return { uri, blob: Buffer.from(content).toString('base64'), mimeType: mimeType ?? 'application/octet-stream' };
    }
  }
  return { uri, text, ...(mimeType ? { mimeType } : {}) };
}
const listParams = z.looseObject({ cursor: z.string().optional() });
const getParams = z.looseObject({ uri: z.string() });
const anyResult = z.record(z.string(), z.unknown());

/** Builds every entry (digests, sizes, frontmatter); rejects when a skill breaks the format. */
export async function loadSkillCatalog(skills: SkillDefinition[]): Promise<SkillCatalog> {
  const files = new Map<string, ResourceResult>();
  const entries = await Promise.all(
    skills.map(async (skill) => {
      const entry = await skillEntry(skill.path, skill.files);
      const listed = new Set(entry.resources === 'dynamic' ? [] : entry.resources.map((file) => file.uri));
      for (const [path, content] of Object.entries(skill.files)) {
        const uri = `skill://${skill.path}/${path}`;
        if (!listed.has(uri)) throw new Error(`Skill ${skill.path}: ${path} is not addressable as ${uri}`);
        if (files.has(uri)) throw new Error(`Skill ${skill.path}: ${uri} is served twice`);
        files.set(uri, fileContent(uri, path, content));
      }
      return entry;
    })
  );
  return { entries, files };
}

export function skillsExtension<Auth>(
  catalog: Promise<SkillCatalog>,
  enabled?: (session: Auth | undefined) => boolean
): McpExtension<Auth> {
  return {
    id: SKILLS_EXTENSION_ID,
    ...(enabled ? { enabled } : {}),
    register(server) {
      server.setRequestHandler(
        SKILLS_LIST_METHOD,
        { params: listParams, result: anyResult },
        async () => ({ skills: (await catalog).entries, ...CACHE_HINT })
      );
      server.setRequestHandler(
        SKILLS_GET_METHOD,
        { params: getParams, result: anyResult },
        async (params) => {
          const skill = (await catalog).entries.find((entry) => entry.uri === params.uri);
          if (!skill) throw new ProtocolError(-32602, `Unknown skill: ${params.uri}`);
          return { skill, ...CACHE_HINT };
        }
      );
    },
    async readResource(uri) {
      const file = (await catalog).files.get(uri);
      return file ? [file] : undefined;
    },
  };
}
