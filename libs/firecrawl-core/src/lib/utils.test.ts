import { asPrettyJson, removeEmptyTopLevel } from './utils.js';

describe('utils', () => {
  it('removeEmptyTopLevel removes undefined and empty objects', () => {
    const res = removeEmptyTopLevel({ a: undefined, b: {}, c: { d: 1 } });
    expect(res).toEqual({ c: { d: 1 } });
  });

  it('asPrettyJson returns stable formatting', () => {
    expect(asPrettyJson({ a: 1 })).toContain('\n');
  });
});
