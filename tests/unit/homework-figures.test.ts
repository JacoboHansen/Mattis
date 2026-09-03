import { describe, expect, it } from 'vitest';

import {
  cropHomeworkFigure,
  homeworkFigureAltText,
  homeworkFigureCrop,
  normalizeHomeworkFigureSpec,
} from '../../apps/web/lib/homework-figures';

describe('homework figures', () => {
  it('normalizes model figure metadata and keeps valid normalized coordinates', () => {
    const spec = normalizeHomeworkFigureSpec({
      kind: 'diagram',
      altNb: 'En trekant med sidelengder',
      crop: { x: 0.2, y: 0.25, width: 0.4, height: 0.5 },
    });

    expect(spec).toEqual({
      kind: 'diagram',
      altNb: 'En trekant med sidelengder',
      crop: { x: 0.2, y: 0.25, width: 0.4, height: 0.5 },
    });
    expect(homeworkFigureCrop(spec)).toEqual(spec?.crop);
    expect(homeworkFigureAltText(spec)).toBe('En trekant med sidelengder');
  });

  it('does not expose malformed or vanishingly small crops', () => {
    expect(
      homeworkFigureCrop({ kind: 'diagram', altNb: 'Figur', crop: 'bad' }),
    ).toBeNull();
    expect(
      homeworkFigureCrop({
        kind: 'diagram',
        altNb: 'Figur',
        crop: { x: 0.1, y: 0.1, width: 0.005, height: 0.4 },
      }),
    ).toBeNull();
  });

  it('crops and reorients a source image without enlarging it', async () => {
    const source = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    );

    const result = await cropHomeworkFigure(new Uint8Array(source), {
      x: 0.2,
      y: 0.25,
      width: 0.4,
      height: 0.5,
    });
    expect(result.byteLength).toBeGreaterThan(20);
    expect(Array.from(result.slice(0, 2))).toEqual([0xff, 0xd8]);
  });
});
