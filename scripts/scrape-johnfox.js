// Scrape ~80 real "good" query letters from thejohnfox.com into .eml files.
// The page is a single static HTML doc with a repeating, regular structure:
//   <strong>Author:</strong> ... <strong>Title:</strong> ... <strong>Point of interest:</strong>
//   <p>letter body</p>  <p>[See the original ...](url)</p>
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { SAMPLES_DIR, writeEml, slugify, authorEmail, ensureDir } from './eml-utils.js';

const URL = 'https://thejohnfox.com/2021/05/100-query-letter-examples-that-got-authors-an-agent/';

const GENRE_HEADINGS = [
  'science fiction', 'fantasy', 'thriller', 'crime', 'mystery', 'humorous fiction', 'humor',
  'historical fiction', 'literary fiction', 'romance', 'young adult', 'middle grade',
  'memoir', 'nonfiction', 'horror', 'women', "women's fiction",
];

function matchGenreHeading(text) {
  const lc = text.toLowerCase();
  if (lc.length > 60) return null; // headings are short
  return GENRE_HEADINGS.find((g) => lc.includes(g)) || null;
}

function isSourceLine(line) {
  const lc = line.toLowerCase();
  return lc.includes('see the original') || lc.includes('original post') || /^\[?\s*see\b/.test(lc) || /^https?:\/\//.test(line.trim());
}

async function main() {
  ensureDir(SAMPLES_DIR);
  let html;
  try {
    const res = await fetch(URL, { headers: { 'User-Agent': 'QueryQuery-sample-fetcher/0.1' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`\n  Could not fetch the sample page (${err.message}).`);
    console.error('  Skipping scrape — use `npm run gen-samples` for offline sample data.\n');
    process.exit(0);
  }

  const $ = cheerio.load(html);
  $('br').replaceWith('\n');

  const container =
    ($('.entry-content').length && $('.entry-content')) ||
    ($('article').length && $('article')) ||
    ($('main').length && $('main')) ||
    $('body');

  const records = [];
  let currentGenre = 'Fiction';
  let rec = null;
  const flush = () => {
    if (rec && rec.author && rec.bodyLines.join(' ').trim().split(/\s+/).length >= 40) {
      records.push(rec);
    }
    rec = null;
  };

  container.find('h1,h2,h3,h4,h5,p,li').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();
    const text = $el.text().replace(/ /g, ' ').trim();
    if (!text) return;

    if (/^h[1-5]$/.test(tag)) {
      const g = matchGenreHeading(text);
      if (g) {
        flush();
        currentGenre = text.replace(/query letter examples?/i, '').trim() || g;
      }
      return;
    }

    const href = $el.find('a').attr('href');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const mAuthor = line.match(/^author\s*:\s*(.+)$/i);
      const mTitle = line.match(/^title\s*:\s*(.+)$/i);
      const mPoi = line.match(/^point of interest\s*:\s*(.+)$/i);
      if (mAuthor) {
        flush();
        rec = { genre: currentGenre, author: mAuthor[1].trim(), title: '', poi: '', sourceUrl: '', bodyLines: [] };
      } else if (mTitle && rec) {
        rec.title = mTitle[1].replace(/^["“']|["”']$/g, '').trim();
      } else if (mPoi && rec) {
        rec.poi = mPoi[1].trim();
      } else if (rec) {
        if (isSourceLine(line)) {
          if (href && !rec.sourceUrl) rec.sourceUrl = href;
        } else {
          rec.bodyLines.push(line);
        }
      }
    }
    if (rec && href && !rec.sourceUrl && /original/i.test(text)) rec.sourceUrl = href;
  });
  flush();

  if (!records.length) {
    console.error('\n  Parsed 0 records — the page structure may have changed.');
    console.error('  Use `npm run gen-samples` for offline sample data.\n');
    process.exit(0);
  }

  // Clear previous scraped goods so re-runs are clean.
  for (const f of fs.readdirSync(SAMPLES_DIR)) {
    if (f.startsWith('good-') && f.endsWith('.eml')) fs.rmSync(path.join(SAMPLES_DIR, f));
  }

  let written = 0;
  const needsReview = [];
  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    const title = r.title || 'Untitled';
    const body = r.bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!r.title || !r.poi) needsReview.push({ index: i, author: r.author, hasTitle: !!r.title, hasPoi: !!r.poi });

    const filename = `good-${String(i + 1).padStart(3, '0')}-${slugify(`${r.author}-${title}`, 40)}.eml`;
    await writeEml(SAMPLES_DIR, filename, {
      from: `${r.author} <${authorEmail(r.author)}>`,
      subject: `Query: ${title} / ${r.genre}`,
      text: body,
      headers: {
        'X-QQ-Corpus': 'good',
        'X-QQ-Author': r.author,
        'X-QQ-Title': title,
        'X-QQ-Genre': r.genre,
        'X-QQ-Source': r.sourceUrl || '',
      },
    });
    written += 1;
  }

  fs.writeFileSync(path.join(SAMPLES_DIR, 'needs-review.json'), JSON.stringify(needsReview, null, 2));
  console.log(`\n  Scraped ${records.length} letters -> wrote ${written} .eml files to samples/`);
  console.log(`  ${needsReview.length} flagged for review (missing title/point-of-interest).\n`);
}

main().catch((err) => {
  console.error('scrape-johnfox failed:', err);
  process.exit(1);
});
