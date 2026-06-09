import { DEFAULT_TYPOGRAPHY_ENHANCEMENT } from '@/services/constants';
import { TypographyEnhancementConfig, TypographyEnhancementKey, ViewSettings } from '@/types/book';

export const TYPOGRAPHY_HIGHLIGHT_CLASS = 'readest-typography-highlight';

type Pair = {
  open: string;
  close: string;
  strictInner?: boolean;
};

type TypographyMatch = {
  key: TypographyEnhancementKey;
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
};

const BOOK_TITLE_PAIRS: Pair[] = [
  { open: '《', close: '》' },
  { open: '〈', close: '〉' },
  { open: '「', close: '」' },
  { open: '『', close: '』' },
  { open: '﹁', close: '﹂' },
  { open: '﹃', close: '﹄' },
  { open: '︽', close: '︾' },
  { open: '︿', close: '﹀' },
  { open: '︻', close: '︼' },
  { open: '﹤', close: '﹥', strictInner: true },
  { open: '<', close: '>', strictInner: true },
];

const INFORMATION_PAIRS: Pair[] = [
  { open: "'", close: "'", strictInner: true },
  { open: '‘', close: '’', strictInner: true },
];

const DIALOGUE_PAIRS: Pair[] = [
  { open: '"', close: '"', strictInner: true },
  { open: '“', close: '”', strictInner: true },
  { open: '〝', close: '〞', strictInner: true },
  { open: '〝', close: '〟', strictInner: true },
];

const SKIPPED_TAGS = new Set([
  'script',
  'style',
  'pre',
  'code',
  'kbd',
  'samp',
  'math',
  'svg',
  'textarea',
  'input',
  'select',
  'option',
  'rp',
  'rt',
]);

const KEY_PRIORITY: Record<TypographyEnhancementKey, number> = {
  bookTitle: 0,
  information: 1,
  dialogue: 2,
};

export const normalizeTypographyEnhancement = (
  config?: Partial<TypographyEnhancementConfig>,
): TypographyEnhancementConfig => ({
  bookTitle: {
    ...DEFAULT_TYPOGRAPHY_ENHANCEMENT.bookTitle,
    ...(config?.bookTitle ?? {}),
  },
  information: {
    ...DEFAULT_TYPOGRAPHY_ENHANCEMENT.information,
    ...(config?.information ?? {}),
  },
  dialogue: {
    ...DEFAULT_TYPOGRAPHY_ENHANCEMENT.dialogue,
    ...(config?.dialogue ?? {}),
  },
});

export const hasEnabledTypographyEnhancement = (config?: Partial<TypographyEnhancementConfig>) => {
  const normalized = normalizeTypographyEnhancement(config);
  return Object.values(normalized).some((item) => item.enabled);
};

const isTraditionalChinese = (primaryLanguage?: string, userLocale?: string) => {
  const locales = [primaryLanguage, userLocale].filter(Boolean);
  return locales.some((locale) => ['zh-Hant', 'zh-TW', 'zh_TW'].includes(locale!));
};

const getPairsForKey = (
  key: TypographyEnhancementKey,
  primaryLanguage?: string,
  userLocale?: string,
): Pair[] => {
  const traditional = isTraditionalChinese(primaryLanguage, userLocale);
  if (key === 'bookTitle') return BOOK_TITLE_PAIRS;
  if (key === 'information') {
    return INFORMATION_PAIRS.concat(
      traditional ? [{ open: '﹃', close: '﹄' }] : [{ open: '﹁', close: '﹂' }],
    );
  }
  return DIALOGUE_PAIRS.concat(
    traditional ? [{ open: '﹁', close: '﹂' }] : [{ open: '﹃', close: '﹄' }],
  );
};

const isAsciiWordChar = (char: string) => /[A-Za-z0-9_]/.test(char);

const hasValidQuoteBoundary = (text: string, pair: Pair, openIndex: number, closeIndex: number) => {
  if (pair.open !== pair.close) return true;
  const beforeOpen = text[openIndex - 1] || '';
  const afterOpen = text[openIndex + pair.open.length] || '';
  const beforeClose = text[closeIndex - 1] || '';
  const afterClose = text[closeIndex + pair.close.length] || '';
  return (
    !(isAsciiWordChar(beforeOpen) && isAsciiWordChar(afterOpen)) &&
    !(isAsciiWordChar(beforeClose) && isAsciiWordChar(afterClose))
  );
};

const findPairMatches = (text: string, key: TypographyEnhancementKey, pairs: Pair[]) => {
  const matches: TypographyMatch[] = [];
  for (const pair of pairs) {
    if (pair.open !== pair.close) {
      const openStack: number[] = [];
      let index = 0;
      while (index < text.length) {
        if (text.startsWith(pair.open, index)) {
          openStack.push(index);
          index += pair.open.length;
          continue;
        }

        if (text.startsWith(pair.close, index)) {
          const start = openStack.pop();
          if (start !== undefined) {
            const contentStart = start + pair.open.length;
            const contentEnd = index;
            const end = contentEnd + pair.close.length;
            const inner = text.slice(contentStart, contentEnd);
            const trimmed = inner.trim();
            if (trimmed && (!pair.strictInner || trimmed === inner)) {
              matches.push({ key, start, contentStart, contentEnd, end });
            }
          }
          index += pair.close.length;
          continue;
        }

        index += 1;
      }
      continue;
    }

    let index = 0;
    while (index < text.length) {
      const start = text.indexOf(pair.open, index);
      if (start === -1) break;

      const contentStart = start + pair.open.length;
      const contentEnd = text.indexOf(pair.close, contentStart);
      if (contentEnd === -1) break;

      const end = contentEnd + pair.close.length;
      const inner = text.slice(contentStart, contentEnd);
      const trimmed = inner.trim();
      if (
        trimmed &&
        (!pair.strictInner || trimmed === inner) &&
        hasValidQuoteBoundary(text, pair, start, contentEnd)
      ) {
        matches.push({ key, start, contentStart, contentEnd, end });
      }
      index = end;
    }
  }
  return matches;
};

const collectMatches = (
  text: string,
  config: TypographyEnhancementConfig,
  primaryLanguage?: string,
  userLocale?: string,
) => {
  const candidates = (Object.keys(config) as TypographyEnhancementKey[])
    .filter((key) => config[key].enabled)
    .flatMap((key) => findPairMatches(text, key, getPairsForKey(key, primaryLanguage, userLocale)))
    .sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return KEY_PRIORITY[a.key] - KEY_PRIORITY[b.key] || b.end - a.end;
    });

  const matches: TypographyMatch[] = [];
  let coveredUntil = -1;
  for (const match of candidates) {
    if (match.start < coveredUntil) continue;
    matches.push(match);
    coveredUntil = match.end;
  }
  return matches;
};

const shouldSkipTextNode = (node: Text) => {
  const parent = node.parentElement;
  if (!parent || !node.textContent?.trim()) return true;
  if (SKIPPED_TAGS.has(parent.tagName.toLowerCase())) return true;
  return !!parent.closest(`.${TYPOGRAPHY_HIGHLIGHT_CLASS}, [cfi-inert]`);
};

const decorateTextNode = (doc: Document, textNode: Text, matches: TypographyMatch[]) => {
  const text = textNode.textContent || '';
  const fragment = doc.createDocumentFragment();
  let cursor = 0;

  for (const match of matches) {
    if (match.contentStart < cursor) continue;
    if (cursor < match.contentStart) {
      fragment.append(doc.createTextNode(text.slice(cursor, match.contentStart)));
    }

    const span = doc.createElement('span');
    span.className = TYPOGRAPHY_HIGHLIGHT_CLASS;
    span.setAttribute('data-typography-enhancement', match.key);
    span.setAttribute('cfi-skip', '');
    span.textContent = text.slice(match.contentStart, match.contentEnd);
    fragment.append(span);

    cursor = match.contentEnd;
  }

  if (cursor < text.length) {
    fragment.append(doc.createTextNode(text.slice(cursor)));
  }
  textNode.replaceWith(fragment);
};

export const decorateTypographyEnhancementDoc = (
  doc: Document,
  viewSettings: Pick<ViewSettings, 'typographyEnhancement'>,
  context: { primaryLanguage?: string; userLocale?: string } = {},
) => {
  const config = normalizeTypographyEnhancement(viewSettings.typographyEnhancement);
  if (!hasEnabledTypographyEnhancement(config)) return 0;

  const root = doc.body || doc.documentElement;
  if (!root) return 0;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      shouldSkipTextNode(node as Text) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });

  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);

  let decorated = 0;
  for (const textNode of nodes) {
    const matches = collectMatches(
      textNode.textContent || '',
      config,
      context.primaryLanguage,
      context.userLocale,
    );
    if (!matches.length) continue;
    decorateTextNode(doc, textNode, matches);
    decorated += matches.length;
  }
  return decorated;
};
