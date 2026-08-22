import { describe, expect, it } from 'vitest';

import { splitMathText } from '../../apps/web/app/components/math-text';

describe('math text', () => {
  it('finds inline and display LaTeX without changing surrounding text', () => {
    expect(splitMathText('Løs \\(x^2 = \\frac{9}{4}\\). Vis \\[x = \\frac{3}{2}\\]')).toEqual([
      { type: 'text', value: 'Løs ' },
      { type: 'math', value: 'x^2 = \\frac{9}{4}', display: false },
      { type: 'text', value: '. Vis ' },
      { type: 'math', value: 'x = \\frac{3}{2}', display: true },
    ]);
  });

  it('also recognizes legacy dollar delimiters from older stored tutor replies', () => {
    expect(splitMathText('Da får vi $x=3$.')).toEqual([
      { type: 'text', value: 'Da får vi ' },
      { type: 'math', value: 'x=3', display: false },
      { type: 'text', value: '.' },
    ]);
  });

  it('normalizes a second JSON escape before parsing LaTeX delimiters', () => {
    expect(splitMathText('Løs \\\\(x = \\\\frac{3}{2}\\\\)')).toEqual([
      { type: 'text', value: 'Løs ' },
      { type: 'math', value: 'x = \\frac{3}{2}', display: false },
    ]);
  });
});
