import { defaultConfigSearchPaths, loadFirecrawlConfig, resolveConfig } from './config.js';

describe('config', () => {
  it('defaultConfigSearchPaths prefers FIRECRAWL_CONFIG', () => {
    const paths = defaultConfigSearchPaths({
      FIRECRAWL_CONFIG: '/x/config.json',
      HOME: '/home/u',
      XDG_CONFIG_HOME: '/xdg',
    });
    expect(paths[0]).toBe('/x/config.json');
  });

  it('loadFirecrawlConfig returns empty when none exist', async () => {
    const res = await loadFirecrawlConfig({
      env: { HOME: '/home/u' },
      readFileFn: async () => '',
    });
    expect(res.file).toBeUndefined();
    expect(res.path).toBeUndefined();
  });

  it('resolveConfig merges env, file, and flags', () => {
    const cfg = resolveConfig(
      { FIRECRAWL_API_KEY: 'k-env', FIRECRAWL_PROFILE: 'p-env' },
      { apiKey: 'k-flag' },
      { profiles: { 'p-env': { apiKey: 'k-file' } } },
      '/cfg.json'
    );

    expect(cfg.profile).toBe('p-env');
    expect(cfg.apiKey).toBe('k-flag');
    expect(cfg.configPath).toBe('/cfg.json');
  });
});
