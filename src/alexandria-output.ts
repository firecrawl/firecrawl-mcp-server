const INLINE_TOKEN_BUDGET = 20_000;

type Call = { provider: string; capability: string };
type Post = (body: unknown, requestId: string) => Promise<any>;

export async function alexandriaOutput(
  payload: any,
  calls: Call[],
  post: Post,
  recoveryRequestId: string
): Promise<string> {
  const serialized = JSON.stringify(payload);
  const responseBytes = Buffer.byteLength(serialized, 'utf8');
  const estimatedTokens = Math.ceil(responseBytes / 4);
  const items = payload?.data?.alexandria;
  if (
    estimatedTokens <= INLINE_TOKEN_BUDGET ||
    payload?.success !== true ||
    !Array.isArray(items) ||
    items.length !== calls.length ||
    items.some((item: any) => item.error || item.data === undefined) ||
    calls.some((call) => call.provider === 'firecrawl')
  )
    return serialized;

  try {
    const probe = await post(
      {
        alexandria: {
          provider: 'firecrawl',
          capability: 'bash',
          options: {
            requestId: payload.requestId,
            command:
              "jq -c '[.data.alexandria[] | [.provider,.capability]]' response.json",
          },
        },
        timeout: 10_000,
      },
      recoveryRequestId
    );
    const result = probe?.data?.alexandria?.[0];
    const workspace = result?.data;
    if (
      probe?.success !== true ||
      result?.error ||
      workspace?.exitCode !== 0 ||
      typeof workspace?.workspaceId !== 'string' ||
      !workspace.workspaceId ||
      JSON.stringify(JSON.parse(workspace.stdout)) !==
        JSON.stringify(
          items.map((item: any) => [item.provider, item.capability])
        )
    )
      return serialized;

    return JSON.stringify({
      success: true,
      requestId: payload.requestId,
      scrape_id: payload.scrape_id,
      receipt: payload.receipt,
      creditsCost: payload.data.creditsCost,
      delivery: 'retained',
      responseBytes,
      estimatedTokens,
      tokenEstimateMethod: 'utf8-bytes/4',
      inlineTokenBudget: INLINE_TOKEN_BUDGET,
      workspaceId: workspace.workspaceId,
      idleTtlSeconds: workspace.idleTtlSeconds ?? 300,
      message:
        'The full result is retained. Inspect it with remote Bash; do not rerun the provider. Use small projections and slices. If the workspace expires, reload using the source requestId.',
      nextTool: {
        name: 'firecrawl_scrape',
        arguments: {
          alexandria: {
            provider: 'firecrawl',
            capability: 'bash',
            options: {
              workspaceId: workspace.workspaceId,
              command:
                "jq '.data.alexandria[] | {provider, capability, fields: (.data | keys)}' response.json",
            },
          },
        },
      },
    });
  } catch {
    return serialized;
  }
}
