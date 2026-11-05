#!/usr/bin/env node
process.env.TS_MOCK_VARIANT = 'a';
await import('../src/server.mjs');
