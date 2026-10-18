/*
 * Local relevance scoring over the cached Help Center index.
 *
 * Ranking model (matches how support agents actually search):
 *   - a query word in the TITLE outranks the same word buried in the body
 *   - body matches still surface the article, just lower down
 *   - articles missing some of the query words get pushed down hard
 *
 * So searching "SSD" puts "How to Test SSD Health" and "How to install or
 * reseat an M.2 SSD" on top, while "How to use HD Tune" (which mentions SSD
 * once in its body) still shows up further down.
 */

/* Query words expand to these at reduced weight, so "GPU reseat" finds
 * "How to reseat your graphics card" even though it never says "GPU"
 * in the title. */
const SYNONYMS = {
  gpu: ['graphics', 'video', 'vga'],
  graphics: ['gpu', 'video'],
  ssd: ['nvme', 'm2', 'drive', 'storage', 'disk'],
  nvme: ['ssd', 'm2', 'drive'],
  hdd: ['drive', 'disk', 'storage'],
  drive: ['ssd', 'disk', 'storage'],
  ram: ['memory', 'dimm'],
  memory: ['ram', 'dimm'],
  cpu: ['processor'],
  processor: ['cpu'],
  psu: ['power', 'supply'],
  mobo: ['motherboard', 'board'],
  motherboard: ['mobo', 'board'],
  bios: ['uefi', 'firmware'],
  uefi: ['bios', 'firmware'],
  rgb: ['lighting', 'light', 'led'],
  lighting: ['rgb', 'led'],
  wifi: ['wireless', 'internet', 'network', 'ethernet'],
  internet: ['network', 'wifi', 'ethernet', 'connectivity'],
  audio: ['sound', 'headset', 'speakers'],
  sound: ['audio', 'headset', 'speakers'],
  monitor: ['display', 'screen', 'monitors'],
  display: ['monitor', 'screen'],
  driver: ['drivers'],
  drivers: ['driver'],
  windows: ['win11', 'os'],
  rma: ['return', 'package', 'packaging', 'shipping'],
  temps: ['temperature', 'thermal', 'cooling'],
  cooling: ['coolant', 'watercooled', 'thermal'],
  boot: ['startup', 'post', 'turn'],
  cmos: ['bios', 'reset'],
  key: ['activation', 'license', 'bitlocker'],
};

const W = {
  titleExact: 12,
  titlePrefix: 7,
  titleFuzzy: 4,
  excerptExact: 3,
  bodyBase: 2,
  bodyRepeatCap: 3,
  bodyLoose: 0.5,
  phraseInTitle: 25,
  titleStartsWithPhrase: 10,
  phraseInExcerpt: 6,
  phraseInBody: 8,
  everyWordInTitle: 15,
  aliasFactor: 0.4,
};

export function tokenize(str) {
  return String(str || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

/* Precompute per-article lookups once, so typing stays instant. */
export function prepare(articles) {
  return (articles || []).map((a) => {
    const titleTokens = tokenize(a.title);
    const bodyCounts = new Map();
    for (const t of tokenize(a.text)) {
      bodyCounts.set(t, (bodyCounts.get(t) || 0) + 1);
    }
    return {
      ...a,
      _titleLower: String(a.title || '').toLowerCase(),
      _excerptLower: String(a.excerpt || '').toLowerCase(),
      _textLower: String(a.text || '').toLowerCase(),
      _titleTokens: titleTokens,
      _titleSet: new Set(titleTokens),
      _excerptSet: new Set(tokenize(a.excerpt)),
      _bodyCounts: bodyCounts,
    };
  });
}

/* Edit distance of 1 or less — catches "resat" -> "reseat". */
function withinOneEdit(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    diff += 1;
    if (diff > 1) return false;
    if (la > lb) i += 1;
    else if (lb > la) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return diff + (la - i) + (lb - j) <= 1;
}

function scoreWord(doc, word) {
  let score = 0;
  let matched = false;

  if (doc._titleSet.has(word)) {
    score += W.titleExact;
    matched = true;
  } else if (word.length >= 2 && doc._titleTokens.some((t) => t.startsWith(word))) {
    score += W.titlePrefix;
    matched = true;
  } else if (word.length >= 4 && doc._titleTokens.some((t) => withinOneEdit(t, word))) {
    score += W.titleFuzzy;
    matched = true;
  }

  if (doc._excerptSet.has(word)) {
    score += W.excerptExact;
    matched = true;
  }

  const hits = doc._bodyCounts.get(word) || 0;
  if (hits > 0) {
    // Saturating, so a long article can't win on repetition alone.
    score += W.bodyBase + Math.min(W.bodyRepeatCap, Math.log2(1 + hits));
    matched = true;
  } else if (word.length >= 3 && doc._textLower.includes(word)) {
    score += W.bodyLoose;
    matched = true;
  }

  return { score, matched };
}

export function search(docs, query, limit = 30) {
  const raw = String(query || '').trim();
  if (!raw) return [];

  const phrase = raw.toLowerCase();
  const words = [...new Set(tokenize(raw))];
  if (!words.length) return [];

  const results = [];

  for (const doc of docs) {
    let score = 0;
    let matchedWords = 0;

    for (const word of words) {
      const direct = scoreWord(doc, word);
      let best = direct.matched ? direct.score : 0;
      let hit = direct.matched;

      // Always consider synonyms and keep the strongest signal — a query word
      // that only matches the body can still be beaten by a synonym in the
      // title, which is where "GPU" should find "…your graphics card".
      for (const alias of SYNONYMS[word] || []) {
        const viaAlias = scoreWord(doc, alias);
        if (viaAlias.matched) {
          best = Math.max(best, viaAlias.score * W.aliasFactor);
          hit = true;
        }
      }

      if (hit) {
        matchedWords += 1;
        score += best;
      }
    }

    if (!matchedWords) continue;

    if (words.length > 1 && doc._titleLower.includes(phrase)) score += W.phraseInTitle;
    else if (words.length === 1 && doc._titleSet.has(words[0])) score += W.phraseInTitle;

    if (doc._titleLower.startsWith(phrase)) score += W.titleStartsWithPhrase;
    if (doc._excerptLower.includes(phrase)) score += W.phraseInExcerpt;
    if (doc._textLower.includes(phrase)) score += W.phraseInBody;
    if (words.every((w) => doc._titleSet.has(w))) score += W.everyWordInTitle;

    // Articles that only match part of the query drop away sharply.
    const coverage = matchedWords / words.length;
    if (coverage < 1) score *= Math.pow(coverage, 1.5);

    results.push({ doc, score });
  }

  results.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
  return results.slice(0, limit);
}

export function snippet(doc, query, length = 150) {
  const text = doc.text || doc.excerpt || '';
  if (!text) return '';

  const lower = text.toLowerCase();
  const phrase = String(query || '').trim().toLowerCase();
  let at = phrase ? lower.indexOf(phrase) : -1;

  if (at < 0) {
    for (const word of tokenize(query)) {
      const i = lower.indexOf(word);
      if (i >= 0) {
        at = i;
        break;
      }
    }
  }

  if (at < 0) {
    return text.slice(0, length).trim() + (text.length > length ? '…' : '');
  }

  let start = Math.max(0, at - Math.floor(length / 3));
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space > -1 && space - start < 20) start = space + 1;
  }

  const end = start + length;
  const body = text.slice(start, end).trim();
  return (start > 0 ? '…' : '') + body + (end < text.length ? '…' : '');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlight(text, query) {
  const words = [...new Set(tokenize(query))]
    .filter((w) => w.length >= 2)
    .sort((a, b) => b.length - a.length);

  if (!words.length) return escapeHtml(text);

  const re = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  let out = '';
  let last = 0;
  let m;

  while ((m = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index)) + '<mark>' + escapeHtml(m[0]) + '</mark>';
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }

  return out + escapeHtml(text.slice(last));
}

export { escapeHtml };
