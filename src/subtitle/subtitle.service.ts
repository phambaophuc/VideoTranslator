import { Injectable } from '@nestjs/common';
import { WhisperSegment } from '../transcription/transcription.types';
import { SubtitleOptions, SubtitleSegment } from './subtitle.types';

interface Token {
  text: string;
  start: number;
  end: number;
}

interface Draft {
  start: number;
  end: number;
  text: string;
}

type Config = Required<SubtitleOptions>;

const DEFAULTS: Config = {
  maxCharsPerLine: 42,
  maxLines: 1,
  maxCps: 16,
  minDuration: 1,
  maxDuration: 7,
  pauseSplit: 1,
  maxMergeGap: 0.5,
  minGap: 0.08,
};

const MIN_DISPLAY = 0.2;

const CJK = '\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef';
const CJK_RE = new RegExp(`[${CJK}]`);
const CJK_SPLIT_RE = new RegExp(`[${CJK}]|[^${CJK}]+`, 'g');

const SENTENCE_END_RE = /[.!?…。！？]["'”’)\]]*$/;
const SOFT_BREAK_RE = /[,;:、，；：]["'”’)\]]*$/;

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'e.g',
  'i.e',
  'tp',
  'gs',
  'ts',
  'pgs',
  'ths',
]);

const textLength = (text: string): number => Array.from(text).length;

function cleanText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:…])/g, '$1')
    .trim();
}

function needsSpace(prev: string, next: string): boolean {
  if (/^[,.!?;:…%]+$/.test(next)) return false;
  if (/^['’]\p{L}{1,2}$/u.test(next) || /^n['’]t$/i.test(next)) return false;
  return !(CJK_RE.test(prev.slice(-1)) || CJK_RE.test(next.charAt(0)));
}

function joinTokens(parts: string[]): string {
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    out = out ? out + (needsSpace(out, part) ? ' ' : '') + part : part;
  }
  return out;
}

function isSentenceEnd(token: string): boolean {
  if (!SENTENCE_END_RE.test(token)) return false;

  const match = /^(.*?)\.["'”’)\]]*$/.exec(token);
  if (!match) return true; // kết thúc bằng ! ? … 。

  const stem = match[1];
  return !(ABBREVIATIONS.has(stem.toLowerCase()) || /^\p{Lu}$/u.test(stem));
}

const isSoftBreak = (token: string): boolean => SOFT_BREAK_RE.test(token);

function greedyWrap(tokens: string[], width: number, sep: string): string[] {
  const lines: string[] = [];
  let current = '';

  for (const token of tokens) {
    const next = current ? current + sep + token : token;
    if (current && textLength(next) > width) {
      lines.push(current);
      current = token;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

@Injectable()
export class SubtitleService {
  createSubtitleSegments(
    segments: WhisperSegment[],
    options: SubtitleOptions = {},
  ): SubtitleSegment[] {
    const cfg: Config = { ...DEFAULTS, ...options };

    const drafts: Draft[] = segments
      .flatMap((segment) => this.splitSegment(segment, cfg))
      .filter((draft) => draft.text.length > 0 && draft.end >= draft.start);

    const merged = this.mergeShort(drafts, cfg);

    return this.fixTimings(merged, cfg).map((draft, index) => ({
      sequence: index + 1,
      start: draft.start,
      end: draft.end,
      text: this.formatText(draft.text, cfg),
    }));
  }

  generateSrt(segments: SubtitleSegment[]): string {
    if (segments.length === 0) return '';

    const body = segments
      .map((segment) =>
        [
          segment.sequence,
          `${this.formatTimestamp(segment.start)} --> ${this.formatTimestamp(segment.end)}`,
          segment.text,
        ].join('\n'),
      )
      .join('\n\n');

    return `${body}\n`;
  }

  createTranslationUnits(
    segments: WhisperSegment[],
    options: SubtitleOptions = {},
  ): SubtitleSegment[] {
    const cfg: Config = { ...DEFAULTS, ...options };

    const drafts = segments
      .flatMap((segment) => {
        const tokens = this.toTokens(segment);
        if (tokens.length === 0) return [];
        return this.splitAtHardBreaks(tokens, cfg).map((group) =>
          this.toDraft(group),
        );
      })
      .filter((draft) => draft.text.length > 0 && draft.end >= draft.start);

    return drafts.map((draft, index) => ({
      sequence: index + 1,
      start: draft.start,
      end: draft.end,
      text: draft.text,
    }));
  }

  finalizeTranslatedSegments(
    units: SubtitleSegment[],
    translated: SubtitleSegment[],
    options: SubtitleOptions = {},
  ): SubtitleSegment[] {
    const cfg: Config = { ...DEFAULTS, ...options };
    const translatedBySequence = new Map(
      translated.map((segment) => [segment.sequence, segment.text]),
    );

    const drafts = units.flatMap((unit) => {
      const text = translatedBySequence.get(unit.sequence)?.trim();
      if (!text) return [];

      const tokens = this.syntheticTokens(text, unit.start, unit.end);
      if (tokens.length === 0) return [];

      return this.fitGroup(tokens, cfg).map((group) => this.toDraft(group));
    });

    const merged = this.mergeShort(drafts, cfg);

    return this.fixTimings(merged, cfg).map((draft, index) => ({
      sequence: index + 1,
      start: draft.start,
      end: draft.end,
      text: this.formatText(draft.text, cfg),
    }));
  }

  private splitSegment(segment: WhisperSegment, cfg: Config): Draft[] {
    const tokens = this.toTokens(segment);
    if (tokens.length === 0) return [];

    return this.splitAtHardBreaks(tokens, cfg)
      .flatMap((group) => this.fitGroup(group, cfg))
      .map((group) => this.toDraft(group));
  }

  private toTokens(segment: WhisperSegment): Token[] {
    const fromWords: Token[] = (segment.words ?? []).flatMap((word) => {
      const text = word.word.normalize('NFC').replace(/\s+/g, ' ').trim();
      if (!text || !Number.isFinite(word.start) || !Number.isFinite(word.end)) {
        return [];
      }
      return [{ text, start: word.start, end: Math.max(word.end, word.start) }];
    });

    return fromWords.length > 0 ? fromWords : this.tokensFromText(segment);
  }

  private tokensFromText(segment: WhisperSegment): Token[] {
    return this.syntheticTokens(segment.text ?? '', segment.start, segment.end);
  }

  private syntheticTokens(text: string, start: number, end: number): Token[] {
    const raw = cleanText(text);
    if (!raw) return [];

    const parts = raw
      .split(' ')
      .flatMap((part) =>
        CJK_RE.test(part) ? (part.match(CJK_SPLIT_RE) ?? [part]) : [part],
      );

    const weight = (part: string) => textLength(part) + 1;
    const totalWeight = parts.reduce((sum, part) => sum + weight(part), 0);
    const duration = Math.max(end - start, 0);

    let cursor = start;
    return parts.map((part) => {
      const span = (duration * weight(part)) / totalWeight;
      const token = { text: part, start: cursor, end: cursor + span };
      cursor += span;
      return token;
    });
  }

  private splitAtHardBreaks(tokens: Token[], cfg: Config): Token[][] {
    const groups: Token[][] = [];
    let current: Token[] = [];

    tokens.forEach((token, index) => {
      current.push(token);
      const next = tokens[index + 1];
      const longPause =
        next !== undefined && next.start - token.end > cfg.pauseSplit;

      if (isSentenceEnd(token.text) || longPause) {
        groups.push(current);
        current = [];
      }
    });

    if (current.length > 0) groups.push(current);
    return groups;
  }

  private fitGroup(tokens: Token[], cfg: Config): Token[][] {
    if (tokens.length < 2 || this.groupFits(tokens, cfg)) return [tokens];

    const minSide = tokens.length >= 4 ? 2 : 1;
    let bestIndex = -1;
    let bestScore = Infinity;

    for (let i = 1; i < tokens.length; i++) {
      const left = textLength(
        joinTokens(tokens.slice(0, i).map((t) => t.text)),
      );
      const right = textLength(joinTokens(tokens.slice(i).map((t) => t.text)));

      let score = Math.abs(left - right) / Math.max(left + right, 1);
      if (isSoftBreak(tokens[i - 1].text)) score -= 0.25;
      if (tokens[i].start - tokens[i - 1].end >= 0.3) score -= 0.15;
      if (i < minSide || tokens.length - i < minSide) score += 0.5;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return [
      ...this.fitGroup(tokens.slice(0, bestIndex), cfg),
      ...this.fitGroup(tokens.slice(bestIndex), cfg),
    ];
  }

  private groupFits(tokens: Token[], cfg: Config): boolean {
    const text = joinTokens(tokens.map((t) => t.text));
    const duration = tokens[tokens.length - 1].end - tokens[0].start;
    return this.textFits(text, duration, cfg);
  }

  private textFits(text: string, duration: number, cfg: Config): boolean {
    return duration <= cfg.maxDuration && this.wrapLines(text, cfg) !== null;
  }

  private toDraft(tokens: Token[]): Draft {
    return {
      start: tokens[0].start,
      end: tokens[tokens.length - 1].end,
      text: cleanText(joinTokens(tokens.map((t) => t.text))),
    };
  }

  private mergeShort(drafts: Draft[], cfg: Config): Draft[] {
    const out = [...drafts];
    let i = 0;

    while (i < out.length) {
      const current = out[i];

      if (current.end - current.start >= cfg.minDuration) {
        i++;
        continue;
      }

      const prev = out[i - 1];
      const next = out[i + 1];
      const gapPrev =
        prev && this.canMerge(prev, current, cfg)
          ? current.start - prev.end
          : Infinity;
      const gapNext =
        next && this.canMerge(current, next, cfg)
          ? next.start - current.end
          : Infinity;

      if (gapPrev === Infinity && gapNext === Infinity) {
        i++;
      } else if (gapNext <= gapPrev) {
        out.splice(i, 2, this.mergeDrafts(current, next));
      } else {
        out.splice(i - 1, 2, this.mergeDrafts(prev, current));
        i--;
      }
    }

    return out;
  }

  private canMerge(a: Draft, b: Draft, cfg: Config): boolean {
    if (b.start - a.end > cfg.maxMergeGap) return false;
    const text = joinTokens([a.text, b.text]);
    return this.textFits(text, Math.max(a.end, b.end) - a.start, cfg);
  }

  private mergeDrafts(a: Draft, b: Draft): Draft {
    return {
      start: a.start,
      end: Math.max(a.end, b.end),
      text: joinTokens([a.text, b.text]),
    };
  }

  private fixTimings(drafts: Draft[], cfg: Config): Draft[] {
    const out: Draft[] = [];

    drafts.forEach((draft, index) => {
      const prevEnd = out.length > 0 ? out[out.length - 1].end : 0;
      const start = Math.max(draft.start, prevEnd);

      const nextStart = drafts[index + 1]?.start ?? Infinity;
      const limit = nextStart - cfg.minGap;

      const needed = Math.max(
        cfg.minDuration,
        textLength(draft.text) / cfg.maxCps,
      );
      const wanted = Math.max(draft.end, start + needed);
      const end = Math.max(Math.min(wanted, limit), start + MIN_DISPLAY);

      out.push({ ...draft, start, end });
    });

    return out;
  }

  private wrapLines(text: string, cfg: Config): string[] | null {
    const total = textLength(text);
    if (total <= cfg.maxCharsPerLine) return [text];

    const needed = Math.ceil(total / cfg.maxCharsPerLine);
    if (needed > cfg.maxLines) return null;

    const byChar = !text.includes(' ') && CJK_RE.test(text);
    const tokens = byChar ? Array.from(text) : text.split(' ');
    const sep = byChar ? '' : ' ';

    for (
      let width = Math.ceil(total / needed);
      width <= cfg.maxCharsPerLine;
      width++
    ) {
      const lines = greedyWrap(tokens, width, sep);
      if (
        lines.length <= cfg.maxLines &&
        lines.every((l) => textLength(l) <= cfg.maxCharsPerLine)
      ) {
        return lines;
      }
    }

    return null;
  }

  private formatText(text: string, cfg: Config): string {
    return (this.wrapLines(text, cfg) ?? [text]).join('\n');
  }

  private formatTimestamp(seconds: number): string {
    const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(totalMilliseconds / 3_600_000);
    const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
    const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
    const milliseconds = totalMilliseconds % 1000;

    return (
      `${hours.toString().padStart(2, '0')}:` +
      `${minutes.toString().padStart(2, '0')}:` +
      `${secs.toString().padStart(2, '0')},` +
      milliseconds.toString().padStart(3, '0')
    );
  }
}
