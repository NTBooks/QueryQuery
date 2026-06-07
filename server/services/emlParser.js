// Parse a raw .eml buffer/string into the fields QueryQuery cares about.
import { simpleParser } from 'mailparser';
import EmailReplyParser from 'email-reply-parser';

const replyParser = new EmailReplyParser();

/** Strip HTML tags to plain-ish text as a last resort. */
function htmlToText(html) {
  return String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

/** Collapse excessive blank lines / trailing whitespace. */
function tidy(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param {Buffer|string} raw raw .eml content
 * @returns {Promise<{from_addr:string, from_name:string, subject:string, received_at:string, body:string, headers:Object}>}
 */
export async function parseEml(raw) {
  const mail = await simpleParser(raw, { defaultCharset: 'utf-8', skipImageLinks: true });

  const fromObj = mail.from?.value?.[0] || {};
  const from_addr = fromObj.address || '';
  const from_name = fromObj.name || '';
  const subject = mail.subject || '';
  const received_at = (mail.date instanceof Date ? mail.date : new Date(0)).toISOString();

  // Prefer the plain-text body; fall back to stripped HTML.
  let rawBody = mail.text && mail.text.trim() ? mail.text : (mail.html ? htmlToText(mail.html) : '');

  // Strip signatures and quoted replies, but never let it nuke the whole letter.
  let visible = rawBody;
  try {
    const parsed = replyParser.read(rawBody);
    const v = parsed.getVisibleText();
    if (v && v.trim().length >= Math.min(60, rawBody.trim().length * 0.4)) {
      visible = v;
    }
  } catch {
    /* keep rawBody */
  }

  // Capture our custom ground-truth headers (X-QQ-*) when present.
  const headers = {};
  if (mail.headerLines) {
    for (const { key, line } of mail.headerLines) {
      if (key.startsWith('x-qq-')) {
        const idx = line.indexOf(':');
        headers[key] = idx >= 0 ? line.slice(idx + 1).trim() : '';
      }
    }
  }

  return { from_addr, from_name, subject, received_at, body: tidy(visible), headers };
}

export default parseEml;
