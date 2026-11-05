#!/usr/bin/env node
process.env.TS_MOCK_VARIANT = 'b';
await import('../src/server.mjs');
