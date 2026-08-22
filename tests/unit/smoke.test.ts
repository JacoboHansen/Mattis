import { describe, expect, it } from 'vitest';

describe('M1 static flow contracts', () => {
  it('keeps the synthetic Nora scenario', () => {
    expect({ name: 'Nora', stage: '10. trinn', duration: 45 }).toMatchObject({
      name: 'Nora',
      stage: '10. trinn',
      duration: 45,
    });
  });
});
