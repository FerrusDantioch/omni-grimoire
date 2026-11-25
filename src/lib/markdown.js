/**
 * Rendu Markdown minimaliste et sur : le texte est echappe AVANT toute
 * transformation, donc aucun HTML de l'utilisateur n'est interprete.
 * Couvre ce qu'on ecrit reellement dans un journal de partie.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Decoupe une chaine selon une regex et transforme matches et texte brut separement. */
function mapTokens(text, re, onMatch, onPlain) {
  let out = '';
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out += onPlain(text.slice(last, m.index));
    out += onMatch(m);
    last = m.index + m[0].length;
  }
  if (last < text.length) out += onPlain(text.slice(last));
  return out;
}

function formatPlain(text) {
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

const LINK_OR_URL_RE = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<]+)/g;
const TRAILING_URL_PUNCT = /(?:&quot;|&gt;|&lt;|&#39;|[.,;:!?)])$/;

/** Formatage inline hors code span. Le texte recu est deja echappe. */
function formatSegment(text) {
  return mapTokens(
    text,
    LINK_OR_URL_RE,
    (m) => {
      if (m[1] !== undefined) return formatPlain(m[1]); // images : texte alternatif seulement
      if (m[3] !== undefined) {
        const [, , , label, href] = m;
        return SAFE_URL.test(href)
          ? `<a href="${href.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${formatPlain(label)}</a>`
          : formatPlain(label);
      }
      let url = m[5];
      let suffix = '';
      let match;
      while ((match = TRAILING_URL_PUNCT.exec(url)) !== null) {
        suffix = match[0] + suffix;
        url = url.slice(0, -match[0].length);
      }
      if (!url) return formatPlain(m[5]);
      return `<a href="${url.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${url}</a>${formatPlain(suffix)}`;
    },
    formatPlain
  );
}

/**
 * Applique le formatage inline en laissant les code spans intacts.
 * On decoupe la chaine sur les segments entre accents graves plutot que
 * d'utiliser des marqueurs temporaires, qui pourraient entrer en collision
 * avec le texte de l'utilisateur.
 */
function inline(text) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part) =>
      part.length > 1 && part.startsWith('`') && part.endsWith('`')
        ? `<code>${part.slice(1, -1)}</code>`
        : formatSegment(part)
    )
    .join('');
}

/**
 * Decoupe le markdown en blocs structures — sert au rendu HTML et a l'export PDF.
 * @returns {Array<{type:string, text?:string, level?:number, items?:string[], ordered?:boolean}>}
 */
export function parseBlocks(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', text: body.join(' ') });
      continue;
    }

    if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\d+[.)]\s+/.test(lines[i]) : /^[-*+]\s+/.test(lines[i]))) {
        items.push(lines[i++].replace(ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/, ''));
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|>|[-*+]\s|\d+[.)]\s|```)/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      para.push(lines[i++]);
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

/** Markdown -> HTML (chaine sure, destinee a dangerouslySetInnerHTML). */
export function renderMarkdown(md) {
  return parseBlocks(md)
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          const tag = `h${Math.min(6, block.level + 1)}`;
          return `<${tag}>${inline(escapeHtml(block.text))}</${tag}>`;
        }
        case 'hr':
          return '<hr />';
        case 'code':
          return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
        case 'quote':
          return `<blockquote>${inline(escapeHtml(block.text))}</blockquote>`;
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          const items = block.items.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join('');
          return `<${tag}>${items}</${tag}>`;
        }
        default:
          return `<p>${inline(escapeHtml(block.text)).replace(/\n/g, '<br />')}</p>`;
      }
    })
    .join('\n');
}

function stripInlinePlain(text) {
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Retire les marques markdown d'une ligne (pour texte brut et PDF). */
export function stripInline(text) {
  return mapTokens(
    String(text ?? ''),
    /!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]+)\]\(([^)]*)\)|(https?:\/\/[^\s]+)/g,
    (m) => {
      if (m[1] !== undefined) return stripInlinePlain(m[1]);
      if (m[3] !== undefined) return `${stripInlinePlain(m[3])} (${m[4]})`;
      return m[5];
    },
    stripInlinePlain
  );
}

/** Markdown -> texte brut lisible (export .txt). */
export function markdownToPlainText(md) {
  return parseBlocks(md)
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `${block.text}\n${'='.repeat(Math.max(3, block.text.length))}`;
        case 'hr':
          return '--------------------------------';
        case 'code':
          return block.text;
        case 'quote':
          return `« ${stripInline(block.text)} »`;
        case 'list':
          return block.items.map((it, n) => `${block.ordered ? `${n + 1}.` : '-'} ${stripInline(it)}`).join('\n');
        default:
          return stripInline(block.text);
      }
    })
    .join('\n\n');
}

/** Compte de mots, affiche sous l'editeur. */
export function wordCount(md) {
  const text = markdownToPlainText(md).trim();
  return text ? text.split(/\s+/).length : 0;
}
