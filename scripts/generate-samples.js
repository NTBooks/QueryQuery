// Deterministic, seedable generator of "reject-worthy" (and some decent) query
// letters. Each file is self-labeled via an X-QQ-Defects header so the corpus
// doubles as a test fixture for the scorer. NO AI is used.
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLES_DIR, writeEml, slugify, authorEmail, ensureDir } from './eml-utils.js';

// ---- seeded RNG (mulberry32) for reproducible corpora ----
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = Number(process.env.SEED || 1337);
const rng = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const chance = (p) => rng() < p;

// ---- pools ----
const AGENTS = ['Ms. Hart', 'Mr. Okafor', 'Ms. Delgado', 'Dr. Lin', 'Mx. Rivera', 'Ms. Caldwell', 'Mr. Ferreira'];
const FIRST = ['Mara', 'Elias', 'Priya', 'Declan', 'Noor', 'Theo', 'Imani', 'Soren', 'Lena', 'Cassian', 'Wren', 'Bao', 'Ruth', 'Mateo'];
const LAST = ['Okonkwo', 'Vance', 'Reyes', 'Bellweather', 'Strand', 'Cole', 'Ashby', 'Kestrel', 'Maren', 'Quist', 'Holloway', 'Park'];
const ROLES = ['cartographer', 'detective', 'botanist', 'archivist', 'smuggler', 'nurse', 'clockmaker', 'historian', 'pilot', 'baker'];
const PLACES = ['the drowned city of Halloway', 'a dying generation ship', 'a snowbound mountain town', 'the floating markets of Sereth', 'postwar Lisbon', 'a haunted lighthouse'];

const GENRES = [
  { key: 'fantasy', label: 'fantasy', wc: [95000, 115000], comps: ['V.E. Schwab', 'Naomi Novik', 'The Night Circus', 'Uprooted'] },
  { key: 'sci_fi', label: 'science fiction', wc: [95000, 108000], comps: ['Becky Chambers', 'Martha Wells', 'Project Hail Mary', 'Station Eleven'] },
  { key: 'thriller', label: 'thriller', wc: [85000, 95000], comps: ['Gillian Flynn', 'Riley Sager', 'The Silent Patient', 'Verity'] },
  { key: 'mystery', label: 'mystery', wc: [80000, 92000], comps: ['Richard Osman', 'Tana French', 'The Thursday Murder Club', 'Magpie Murders'] },
  { key: 'romance', label: 'contemporary romance', wc: [75000, 88000], comps: ['Emily Henry', 'Tessa Bailey', 'Beach Read', 'The Hating Game'] },
  { key: 'literary', label: 'literary fiction', wc: [82000, 92000], comps: ['Hanya Yanagihara', 'Celeste Ng', 'A Little Life', 'Tomorrow and Tomorrow'] },
  { key: 'ya', label: 'young adult fantasy', wc: [80000, 92000], comps: ['Leigh Bardugo', 'Holly Black', 'Six of Crows', 'The Cruel Prince'] },
  { key: 'memoir', label: 'memoir', wc: [75000, 88000], comps: ['Tara Westover', 'Michelle Zauner', 'Educated', 'Crying in H Mart'] },
];

const BIOS = [
  'I hold an MFA from the University of Iowa, and my short fiction has appeared in Tin House and Ploughshares.',
  'My work has been longlisted for the Bridport Prize, and I was a finalist for the Pushcart in 2022.',
  'I am a working journalist whose features have run in The Atlantic; this is my debut novel.',
  'I am a high-school teacher and a graduate of the Clarion workshop. This is my first novel.',
];

function makeTitle() {
  const a = ['The', 'A', 'Of', 'When', 'After'];
  const nouns = ['Salt', 'Cartographer', 'Hollow', 'Ember', 'Tide', 'Lantern', 'Archive', 'Reckoning', 'Orchard', 'Cipher'];
  const tails = ['and Bone', 'of Sereth', 'We Buried', "We Don't Speak", 'in Winter', 'of Small Gods'];
  return chance(0.5) ? `${pick(a)} ${pick(nouns)} ${pick(tails)}` : `${pick(nouns)} ${pick(tails)}`;
}

function buildBaseLetter() {
  const g = pick(GENRES);
  const agent = pick(AGENTS);
  const author = `${pick(FIRST)} ${pick(LAST)}`;
  const char = pick(FIRST);
  const role = pick(ROLES);
  const place = pick(PLACES);
  const age = randInt(16, 44);
  const title = makeTitle();
  const wc = randInt(g.wc[0], g.wc[1]);
  const compA = pick(g.comps);
  let compB = pick(g.comps);
  while (compB === compA) compB = pick(g.comps);

  const hook = `${char} has spent ${randInt(3, 20)} years learning to survive ${place} — but survival was never the same as living.`;
  const p1 = `${char}, a ${age}-year-old ${role}, wants nothing more than to leave ${place} behind. But when a stranger arrives with a debt ${char} never agreed to, ${char} must choose between the only home ${char} has known and a secret that could burn it down.`;
  const p2 = `As old allies turn dangerous and the truth claws its way to the surface, ${char} is forced to risk everything — and if ${char} fails, the people ${char} loves will pay the price.`;

  return {
    genre: g,
    author,
    title,
    char,
    wc,
    salutation: `Dear ${agent},`,
    hook,
    pitchParas: [p1, p2],
    compsLine: `${title} will appeal to readers of ${compA} and ${compB} (2022).`,
    metaLine: `${title} is a ${wc.toLocaleString('en-US')}-word ${g.label} novel.`,
    bioLine: pick(BIOS),
    closing: 'Thank you for your time and consideration. The full manuscript is available on request.',
    signature: `Best,\n${author}\n${authorEmail(author)}`,
  };
}

// ---- mutators: each returns a defect tag and mutates the letter ----
const MUTATORS = {
  no_personalization(L) {
    L.salutation = pick(['Dear Agent,', 'To whom it may concern,', 'Dear Literary Agent,', 'Dear [AGENT_NAME],']);
    return 'no_personalization';
  },
  wordcount_out_of_range(L) {
    const tiny = chance(0.5);
    L.wc = tiny ? randInt(18000, 42000) : randInt(165000, 240000);
    L.metaLine = `${L.title} is a ${L.wc.toLocaleString('en-US')}-word ${L.genre.label} novel.`;
    return 'wordcount_out_of_range';
  },
  no_comps(L) {
    L.compsLine = '';
    return 'no_comps';
  },
  outdated_comps(L) {
    L.compsLine = `${L.title} is in the tradition of ${pick(L.genre.comps)} (${randInt(1998, 2008)}) and ${pick(L.genre.comps)} (${randInt(1999, 2007)}).`;
    return 'outdated_comps';
  },
  spoiler_reveal(L) {
    L.pitchParas = [L.pitchParas[0]];
    L.pitchParas.push(`In the end, ${L.char} finally discovers that the stranger was their sibling all along, defeats the villain, and lives happily ever after.`);
    return 'spoiler_reveal';
  },
  unprofessional(L) {
    L.pitchParas[0] += ' THIS BOOK WILL BE A GUARANTEED BESTSELLER AND A MAJOR MOVIE!!!';
    L.bioLine = 'Twelve agents have already rejected this but they were simply wrong. You would be foolish to pass.';
    return 'unprofessional';
  },
  cliche(L) {
    L.hook = `I hope this email finds you well. In a world where anything is possible, have you ever wondered what it truly means to love? This is the next ${pick(['Harry Potter', 'Da Vinci Code', 'Hunger Games'])}.`;
    return 'cliche';
  },
  too_short(L) {
    L.hook = '';
    L.pitchParas = [`My novel is about a ${pick(ROLES)} who goes on an adventure and learns a lot about themselves.`];
    L.compsLine = '';
    L.bioLine = '';
    L.closing = 'Thanks.';
    return 'too_short';
  },
  too_long(L) {
    const filler = [];
    for (let i = 0; i < 6; i += 1) {
      filler.push(
        `Chapter ${i + 1} opens as ${L.char} travels onward, and many things happen along the way, including a long conversation about the history of the region, the politics of the ruling houses, the weather, the food, the customs, the maps, and the many secondary characters who each have their own elaborate backstories that I will now summarize in detail so that you understand the full scope of this sprawling and ambitious work.`
      );
    }
    L.pitchParas = L.pitchParas.concat(filler);
    return 'too_long';
  },
  missing_bio(L) {
    L.bioLine = '';
    return 'missing_bio';
  },
  missing_metadata(L) {
    L.metaLine = '';
    return 'missing_metadata';
  },
  ai_styled(L) {
    L.hook = '';
    L.pitchParas = [
      `In the ever-evolving realm of ${L.genre.label}, this novel seeks to delve into the rich tapestry of human experience.`,
      `The narrative endeavors to illuminate profound themes and navigate the multifaceted nature of identity — a compelling, meticulous, and deeply resonant journey.`,
      `It is a testament to the enduring power of stories to foster understanding and to showcase the indelible bonds that transcend circumstance.`,
    ];
    L.bioLine = 'I am an author who is passionate about crafting narratives that resonate with readers across diverse backgrounds.';
    return 'ai_styled';
  },
  ai_disclosed(L) {
    L.closing = `${L.closing} In the interest of transparency, this query letter was written with the help of AI.`;
    return 'ai_disclosed';
  },
};

const DEFECT_KEYS = Object.keys(MUTATORS);
const CONFLICTS = [['too_short', 'too_long'], ['no_comps', 'outdated_comps'], ['too_short', 'ai_styled'], ['too_short', 'missing_bio']];

function chooseDefects(forced) {
  if (forced) return [forced];
  const n = randInt(1, 3);
  const chosen = [];
  let guard = 0;
  while (chosen.length < n && guard < 20) {
    guard += 1;
    const d = pick(DEFECT_KEYS);
    if (chosen.includes(d)) continue;
    if (CONFLICTS.some(([a, b]) => (a === d && chosen.includes(b)) || (b === d && chosen.includes(a)))) continue;
    chosen.push(d);
  }
  return chosen;
}

function render(L) {
  return [L.salutation, L.hook, ...L.pitchParas, L.compsLine, L.metaLine, L.bioLine, L.closing, L.signature]
    .filter((s) => s && s.trim())
    .join('\n\n');
}

async function main() {
  ensureDir(SAMPLES_DIR);
  const count = Number(process.argv[2] || process.env.COUNT || 520);

  // clear previous synthetic
  for (const f of fs.readdirSync(SAMPLES_DIR)) {
    if (f.startsWith('synth-') && f.endsWith('.eml')) fs.rmSync(path.join(SAMPLES_DIR, f));
  }

  const tally = {};
  let cleanCount = 0;
  for (let i = 0; i < count; i += 1) {
    const L = buildBaseLetter();

    // guarantee coverage of AI cases + a slice of clean letters
    let forced = null;
    if (i % 13 === 0) forced = 'ai_styled';
    else if (i % 17 === 0) forced = 'ai_disclosed';

    const keepClean = !forced && chance(0.18);
    const defects = keepClean ? [] : chooseDefects(forced);
    for (const d of defects) MUTATORS[d](L);
    for (const d of defects) tally[d] = (tally[d] || 0) + 1;
    if (!defects.length) cleanCount += 1;

    const text = render(L);
    const label = defects.length ? defects.join(',') : 'none';
    const filename = `synth-${String(i + 1).padStart(4, '0')}-${slugify(defects[0] || 'clean', 16)}.eml`;
    await writeEml(SAMPLES_DIR, filename, {
      from: `${L.author} <${authorEmail(L.author)}>`,
      subject: `Query: ${L.title} / ${L.genre.label}`,
      text,
      headers: {
        'X-QQ-Corpus': 'synthetic',
        'X-QQ-Genre': L.genre.label,
        'X-QQ-Title': L.title,
        'X-QQ-Author': L.author,
        'X-QQ-Defects': label,
      },
    });
  }

  console.log(`\n  Generated ${count} synthetic letters (seed ${SEED}) -> samples/`);
  console.log(`  ${cleanCount} clean, ${count - cleanCount} with defects.`);
  console.log('  Defect distribution:', tally, '\n');
}

main().catch((err) => {
  console.error('generate-samples failed:', err);
  process.exit(1);
});
