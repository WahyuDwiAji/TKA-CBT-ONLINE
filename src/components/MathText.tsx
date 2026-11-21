import React, { useMemo } from 'react';
import katex from 'katex';
import type { TextDirection } from '../types/cbt';

interface MathTextProps {
  text: string;
  direction?: TextDirection;
  className?: string;
}

const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const JAVANESE_REGEX = /[\uA980-\uA9DF]/;

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'inline-math'; value: string }
  | { kind: 'block-math'; value: string };

function splitMathSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  // Match $$...$$ first, then $...$ (avoiding escaped \$)
  const regex = /(\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\n])+?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', value: input.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      segments.push({ kind: 'block-math', value: token.slice(2, -2).trim() });
    } else {
      segments.push({ kind: 'inline-math', value: token.slice(1, -1).trim() });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < input.length) {
    segments.push({ kind: 'text', value: input.slice(lastIndex) });
  }

  return segments;
}

function renderFormattedText(line: string, keyPrefix: string): React.ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-b-${idx}`} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={`${keyPrefix}-t-${idx}`}>{part}</React.Fragment>;
  });
}

export const MathText: React.FC<MathTextProps> = ({
  text,
  direction = 'auto',
  className = '',
}) => {
  const hasArabic = useMemo(() => ARABIC_REGEX.test(text), [text]);
  const hasJavanese = useMemo(() => JAVANESE_REGEX.test(text), [text]);

  const resolvedDir: 'ltr' | 'rtl' =
    direction === 'rtl'
      ? 'rtl'
      : direction === 'ltr'
        ? 'ltr'
        : hasArabic
          ? 'rtl'
          : 'ltr';

  const segments = useMemo(() => splitMathSegments(text), [text]);

  const scriptClass = hasArabic
    ? 'font-arabic text-[1.15em]'
    : hasJavanese
      ? 'font-javanese text-[1.08em]'
      : '';

  return (
    <div
      dir={resolvedDir}
      className={`${scriptClass} ${resolvedDir === 'rtl' ? 'text-right' : ''} ${className}`}
    >
      {segments.map((seg, idx) => {
        if (seg.kind === 'block-math') {
          let html = '';
          try {
            html = katex.renderToString(seg.value, {
              displayMode: true,
              throwOnError: false,
              strict: false,
            });
          } catch {
            html = seg.value;
          }
          return (
            <div
              key={`bm-${idx}`}
              dir="ltr"
              className="my-2 text-center"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        if (seg.kind === 'inline-math') {
          let html = '';
          try {
            html = katex.renderToString(seg.value, {
              displayMode: false,
              throwOnError: false,
              strict: false,
            });
          } catch {
            html = seg.value;
          }
          return (
            <span
              key={`im-${idx}`}
              dir="ltr"
              className="inline-block align-middle mx-0.5"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        const lines = seg.value.split('\n');
        return (
          <React.Fragment key={`tx-${idx}`}>
            {lines.map((line, lineIdx) => (
              <React.Fragment key={`ln-${idx}-${lineIdx}`}>
                {renderFormattedText(line, `${idx}-${lineIdx}`)}
                {lineIdx < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
};
