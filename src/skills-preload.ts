import { SKILLS_TOOL } from './alexandria.js';
import { integrationFrom, withIntegration } from './integration.js';

const DEFAULT_CLOUD_API_URL = 'https://api.firecrawl.dev';
const DESCRIPTION_MAX_CHARS = 200;

/** A skill as find-skills lists it: what the listing in the firecrawl_skills description needs. */
export interface ListedSkill {
  id: string;
  name?: string;
  description?: string;
  source?: string;
}

export interface TeamSkillsOptions {
  apiKey?: string;
  apiUrl?: string;
  /** FIRECRAWL_INTEGRATION, sent as the request's integration tag. */
  integration?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * The team's own skills, fetched once when a server for one API key starts, so firecrawl_skills
 * can name them in its description. Any failure returns [] rather than delaying or failing startup.
 */
export async function fetchTeamSkills(
  options: TeamSkillsOptions
): Promise<ListedSkill[]> {
  if (!options.apiKey) return [];
  const fetchImpl = options.fetch ?? fetch;
  try {
    // A blank FIRECRAWL_API_URL means the cloud, as resolveApiBaseUrl reads it.
    const url = `${(options.apiUrl?.trim() || DEFAULT_CLOUD_API_URL).replace(/\/+$/, '')}/v2/scrape`;
    const body = withIntegration(
      url,
      {
        alexandria: {
          provider: 'firecrawl',
          capability: 'find-skills',
          options: { limit: 50 },
        },
      },
      integrationFrom(options.integration)
    );
    const response = await fetchImpl(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 4000),
      }
    );
    if (!response.ok) return [];
    const skills: unknown = (await response.json())?.data?.alexandria?.[0]?.data
      ?.skills;
    return Array.isArray(skills)
      ? skills.filter(
          (skill) => skill?.source === 'team' && typeof skill.id === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

const oneLine = (text: unknown) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Pure: the team's skills as a listing for the end of the firecrawl_skills description, one
 * line each, no longer than `maxChars`. Skills that do not fit are left to a query.
 */
export function teamSkillsListing(
  skills: readonly ListedSkill[],
  maxChars: number
): string {
  const head = `\nThe user's team's skills (read one with ${SKILLS_TOOL} {id}):\n`;
  const lines: string[] = [];
  let size = head.length;
  for (const skill of skills) {
    if (skill?.source !== 'team' || typeof skill.id !== 'string') continue;
    const description = oneLine(skill.description).slice(
      0,
      DESCRIPTION_MAX_CHARS
    );
    const line = `- ${skill.id}: ${oneLine(skill.name) || skill.id}${description ? `. ${description}` : ''}`;
    if ((size += line.length + 1) > maxChars) break;
    lines.push(line);
  }
  return lines.length ? `${head}${lines.join('\n')}` : '';
}
