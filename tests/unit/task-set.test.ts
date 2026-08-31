import { describe, expect, it } from 'vitest';

import {
  normalizeTaskSetTitle,
  parseTaskSetResponse,
} from '../../apps/web/lib/ai/task-set';

describe('Mattis task-set naming', () => {
  it('replaces generic model titles with a useful short name', () => {
    expect(normalizeTaskSetTitle('Kort oppgavesett')).toBe('Litt mer øving');
    expect(normalizeTaskSetTitle('Ekstra')).toBe('Litt mer øving');
    expect(normalizeTaskSetTitle('Prosent og brøk i praksis')).toBe(
      'Prosent og brøk i praksis',
    );
  });

  it('normalizes the generated title while keeping the task contract intact', () => {
    const result = parseTaskSetResponse({
      titleNb: 'Et lite oppgavesett',
      tasks: [
        { text: 'Regn ut 2 + 2', taskType: 'calculation' },
        { text: 'Forklar hvordan du tenker.', taskType: 'open_response' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.titleNb).toBe('Litt mer øving');
  });
});
