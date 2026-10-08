/**
 * A non-2xx answer from Core on a path that does not go through the SDK. The
 * status travels with the error so a credential rejection stays recognisable
 * wherever it was raised, rather than being inferred from a message string.
 */
export class CoreHttpError extends Error {
  readonly status: number;
  readonly agent_hints?: string[];

  constructor(message: string, status: number, agentHints?: string[]) {
    super(message);
    this.name = 'CoreHttpError';
    this.status = status;
    if (agentHints !== undefined) this.agent_hints = agentHints;
  }
}
