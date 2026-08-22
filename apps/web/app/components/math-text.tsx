import { createElement, Fragment, type ReactNode } from 'react';

type MathNode =
  | { type: 'row'; children: MathNode[] }
  | { type: 'text'; value: string }
  | { type: 'fraction'; numerator: MathNode; denominator: MathNode }
  | { type: 'root'; value: MathNode }
  | { type: 'script'; base: MathNode; subscript?: MathNode; superscript?: MathNode };

type TextSegment =
  { type: 'text'; value: string } | { type: 'math'; value: string; display: boolean };

const SYMBOLS: Record<string, string> = {
  approx: '≈',
  cdot: '·',
  div: '÷',
  ge: '≥',
  geq: '≥',
  le: '≤',
  leq: '≤',
  neq: '≠',
  pi: 'π',
  pm: '±',
  times: '×',
  theta: 'θ',
  alpha: 'α',
  beta: 'β',
  degree: '°',
};

const DELIMITERS = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g;

export function splitMathText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(DELIMITERS)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ type: 'text', value: text.slice(cursor, index) });
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
    segments.push({
      type: 'math',
      value: value.trim(),
      display: match[1] !== undefined || match[3] !== undefined,
    });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) });
  return segments.length ? segments : [{ type: 'text', value: text }];
}

class LatexParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): MathNode {
    return this.parseRow(false);
  }

  private parseRow(stopAtBrace: boolean): MathNode {
    const children: MathNode[] = [];
    while (this.position < this.source.length) {
      if (stopAtBrace && this.source[this.position] === '}') {
        this.position += 1;
        break;
      }
      let base = this.parseAtom();
      if (!base) continue;
      let subscript: MathNode | undefined;
      let superscript: MathNode | undefined;
      while (this.source[this.position] === '^' || this.source[this.position] === '_') {
        const marker = this.source[this.position];
        this.position += 1;
        const value = this.parseArgument();
        if (marker === '^') superscript = value;
        else subscript = value;
      }
      if (subscript || superscript) {
        base = { type: 'script', base, subscript, superscript };
      }
      children.push(base);
    }
    return children.length === 1 ? children[0]! : { type: 'row', children };
  }

  private parseArgument(): MathNode {
    while (this.source[this.position] === ' ') this.position += 1;
    if (this.source[this.position] === '{') {
      this.position += 1;
      return this.parseRow(true);
    }
    return this.parseAtom() ?? { type: 'text', value: '' };
  }

  private parseAtom(): MathNode | null {
    const current = this.source[this.position];
    if (current === undefined) return null;
    if (current === '}') {
      this.position += 1;
      return { type: 'text', value: '}' };
    }
    if (current === '{') {
      this.position += 1;
      return this.parseRow(true);
    }
    if (current === '\\') return this.parseCommand();
    if (current === '^' || current === '_') {
      this.position += 1;
      return { type: 'text', value: current };
    }

    const start = this.position;
    while (
      this.position < this.source.length &&
      !['\\', '{', '}', '^', '_'].includes(this.source[this.position]!)
    ) {
      this.position += 1;
    }
    return { type: 'text', value: this.source.slice(start, this.position) };
  }

  private parseCommand(): MathNode | null {
    this.position += 1;
    const start = this.position;
    while (/[A-Za-z]/.test(this.source[this.position] ?? '')) this.position += 1;
    const command = this.source.slice(start, this.position);
    if (!command) {
      const escaped = this.source[this.position] ?? '';
      this.position += escaped ? 1 : 0;
      return { type: 'text', value: escaped };
    }
    if (['left', 'right'].includes(command)) return null;
    if (['frac', 'dfrac', 'tfrac'].includes(command)) {
      return {
        type: 'fraction',
        numerator: this.parseArgument(),
        denominator: this.parseArgument(),
      };
    }
    if (command === 'sqrt') return { type: 'root', value: this.parseArgument() };
    if (['text', 'mathrm', 'mathbf', 'operatorname'].includes(command)) {
      return this.parseArgument();
    }
    return { type: 'text', value: SYMBOLS[command] ?? command };
  }
}

function renderPlainTokens(value: string, keyPrefix: string): ReactNode[] {
  return value
    .split(/(\d+(?:[.,]\d+)?|[A-Za-zÆØÅæøå]+|[+\-−=<>()[\]×÷·,:;])/)
    .filter(Boolean)
    .map((token, index) => {
      const key = `${keyPrefix}-${index}`;
      if (/^\d/.test(token)) return createElement('mn', { key }, token);
      if (/^[A-Za-zÆØÅæøå]+$/.test(token)) return createElement('mi', { key }, token);
      if (/^[+\-−=<>()[\]×÷·,:;]$/.test(token)) return createElement('mo', { key }, token);
      return createElement('mtext', { key }, token);
    });
}

function renderMathNode(node: MathNode, key = 'math'): ReactNode {
  if (node.type === 'text') {
    return createElement('mrow', { key }, ...renderPlainTokens(node.value, key));
  }
  if (node.type === 'row') {
    return createElement(
      'mrow',
      { key },
      ...node.children.map((child, index) => renderMathNode(child, `${key}-${index}`)),
    );
  }
  if (node.type === 'fraction') {
    return createElement(
      'mfrac',
      { key },
      renderMathNode(node.numerator, `${key}-numerator`),
      renderMathNode(node.denominator, `${key}-denominator`),
    );
  }
  if (node.type === 'root') {
    return createElement('msqrt', { key }, renderMathNode(node.value, `${key}-value`));
  }
  if (node.subscript && node.superscript) {
    return createElement(
      'msubsup',
      { key },
      renderMathNode(node.base, `${key}-base`),
      renderMathNode(node.subscript, `${key}-sub`),
      renderMathNode(node.superscript, `${key}-sup`),
    );
  }
  if (node.subscript) {
    return createElement(
      'msub',
      { key },
      renderMathNode(node.base, `${key}-base`),
      renderMathNode(node.subscript, `${key}-sub`),
    );
  }
  return createElement(
    'msup',
    { key },
    renderMathNode(node.base, `${key}-base`),
    renderMathNode(node.superscript!, `${key}-sup`),
  );
}

function MathExpression({ latex, display }: { latex: string; display: boolean }) {
  const tree = new LatexParser(latex).parse();
  return createElement(
    'span',
    { className: display ? 'math-display' : 'math-inline' },
    createElement(
      'math',
      { 'aria-label': latex, display: display ? 'block' : 'inline' },
      renderMathNode(tree),
    ),
  );
}

function PlainText({ value }: { value: string }) {
  return value.split('\n').map((line, index, lines) => (
    <Fragment key={`${index}-${line}`}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

export default function MathText({ text }: { text: string }) {
  return splitMathText(text).map((segment, index) =>
    segment.type === 'math' ? (
      <MathExpression
        display={segment.display}
        key={`${index}-${segment.value}`}
        latex={segment.value}
      />
    ) : (
      <PlainText key={`${index}-${segment.value}`} value={segment.value} />
    ),
  );
}
