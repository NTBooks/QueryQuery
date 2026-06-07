import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractComponents, detectGenre, detectWordCount } from '../server/services/components.js';
import { scoreQuery } from '../server/services/scorer.js';
import { analyzeAi } from '../server/services/aiHeuristics.js';
import { DEFAULT_CONFIG } from '../shared/defaultConfig.js';

const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // wantedGenres: fantasy, sci_fi

const CLEAN_FANTASY = `Dear Ms. Hart,

I saw your #MSWL post asking for character-driven epic fantasy, so I am thrilled to share THE SALT CARTOGRAPHER.

Mara, a 24-year-old cartographer, wants nothing more than to leave the drowned city behind. But when a stranger arrives with a debt she never agreed to, she must choose between her only home and a secret that could burn it down.

As old allies turn dangerous, Mara is forced to risk everything, or lose the people she loves.

THE SALT CARTOGRAPHER will appeal to readers of V.E. Schwab and Naomi Novik (2022). It is a 102,000-word fantasy novel.

I hold an MFA from Iowa, and my short fiction has appeared in Tin House.

Thank you for your time and consideration.

Best,
Mara Okonkwo
mara@example.com`;

const BAD_THRILLER = `Dear Agent,

My novel is about a detective who solves a case. In the end, the killer is revealed to be the mayor and everyone lives happily ever after.

It is a 230,000-word thriller novel.

Thanks.`;

test('detectWordCount parses several formats', () => {
  assert.equal(detectWordCount('It is a 95,000-word fantasy novel.'), 95000);
  assert.equal(detectWordCount('complete at 90,000 words'), 90000);
  assert.equal(detectWordCount('roughly 85k'), 85000);
  assert.equal(detectWordCount('no numbers here'), null);
});

test('detectGenre finds genres and ignores "literary agent"', () => {
  assert.equal(detectGenre('a 100,000-word epic fantasy')?.key, 'fantasy');
  assert.equal(detectGenre('this science fiction novel')?.key, 'sci_fi');
  // "literary agent" alone must not register as literary fiction
  assert.equal(detectGenre('Dear literary agent, please consider my book.'), null);
});

test('clean, targeted in-genre letter scores high', () => {
  const c = extractComponents(CLEAN_FANTASY, 'Query: The Salt Cartographer / Fantasy');
  const { score, band, breakdown } = scoreQuery(c, config);
  assert.ok(score >= 75, `expected >=75, got ${score}`);
  assert.ok(['top', 'strong'].includes(band), `band was ${band}`);
  assert.equal(c.metadata.genreKey, 'fantasy');
  assert.equal(c.metadata.wordCount, 102000);
  assert.ok(c.salutation.personalized);
  assert.ok(c.pitch.hasStakes);
  assert.ok(!breakdown.flags.includes('no_comps'));
});

test('spoiler + overlong + no-comps letter scores low with flags', () => {
  const c = extractComponents(BAD_THRILLER, 'Query: Untitled / Thriller');
  const { score, band, breakdown } = scoreQuery(c, config);
  assert.ok(score <= 45, `expected <=45, got ${score}`);
  assert.equal(band, 'likely_reject');
  assert.ok(breakdown.flags.includes('spoiler_reveal'));
  assert.ok(breakdown.flags.includes('no_comps'));
  assert.ok(breakdown.flags.includes('wordcount_out_of_range'));
  assert.ok(breakdown.flags.includes('mass_mail') || breakdown.flags.includes('no_personalization'));
});

test('AI-styled text yields high suspicion; human text low', () => {
  const aiText =
    'In the ever-evolving realm of storytelling, this novel seeks to delve into the rich tapestry of human experience. ' +
    'The narrative endeavors to illuminate profound themes and navigate the multifaceted nature of identity. ' +
    'It is a testament to the enduring power of stories to foster understanding and showcase indelible bonds.';
  const humanText =
    "Okay, here's the deal. Mara's broke, she's scared, and she can't stop lying to the one person who trusts her. " +
    "I wrote this in a year of late nights. It's messy and angry and I love it.";
  const ai = analyzeAi(aiText, config);
  const human = analyzeAi(humanText, config);
  assert.ok(ai.aiSuspicion > human.aiSuspicion, `ai ${ai.aiSuspicion} should exceed human ${human.aiSuspicion}`);
  assert.ok(ai.matchedAiPhrases.length >= 3);
});

test('AI disclosure is detected', () => {
  const { aiDisclosed } = analyzeAi('My pitch here. This query was written with the help of AI.', config);
  assert.equal(aiDisclosed, true);
  const none = analyzeAi('A perfectly ordinary query with feelings and doubt.', config);
  assert.equal(none.aiDisclosed, false);
});

test('dark comedy / satire genre is detected', () => {
  assert.equal(detectGenre('At 70k words, this is a dark comedy.')?.key, 'comedy');
  assert.equal(detectGenre('a satirical novel about money')?.key, 'comedy');
});

test('comps detected via "Title by Author" and "Author\'s Title"', () => {
  const c = extractComponents("Like Counterfeit by Kirstin Chen, with the gallows humor of MJ Wassmer's Zero Stars.", '');
  assert.ok(c.comps.present);
  assert.ok(c.comps.authors.includes('Kirstin Chen'), `authors: ${c.comps.authors}`);
  assert.ok(c.comps.authors.includes('MJ Wassmer'), `authors: ${c.comps.authors}`);
  assert.ok(c.comps.count >= 2);
});

const YOLO = `Dear Ms. Phair,

I'm querying you because you want upmarket and book-club fiction with a strong hook, and your list leans into Business and Finance. The protagonist of YOLOSAPIENS is a Wall Street trader and the plot turns on a meme-coin scam, so it should be right in your lane.

When Frankie Bardo's younger brother, Rich, dies by suicide over a phantom loss in a retail trading app, Frankie and his two high school best friends reunite after a decade apart. As they set out on a road trip to scatter Rich's ashes, they hatch a plan to scam Brent's millions of young fans with a crypto rug pull, and each must choose between greed and loyalty or lose everything.

At 70k words, YOLOSAPIENS is a dark comedy shared among three imperfect narrators.

Like Counterfeit by Kirstin Chen, it explores morality in a world designed to reward the immoral, with the gallows humor of MJ Wassmer's Zero Stars, Do Not Recommend.

I'm an international hackathon-winning programmer who has traded crypto and mined Bitcoin since 2012, and my short stories have been published in NiftyLit. YOLOSAPIENS is my debut novel.

Thank you for your time and consideration,

Nick Tantillo`;

test('real dark-comedy query: genre + comps detected, bio year is not a comp', () => {
  const c = extractComponents(YOLO, 'Query: YOLOSAPIENS');
  assert.equal(c.metadata.genreKey, 'comedy');
  assert.equal(c.metadata.wordCount, 70000);
  assert.ok(c.comps.present, 'comps should be present');
  assert.ok(c.comps.count >= 2, `comp count: ${c.comps.count}`);
  assert.ok(!c.comps.years.includes(2012), 'bio year 2012 must not be treated as a comp year');
  const { breakdown } = scoreQuery(c, config);
  assert.ok(!breakdown.flags.includes('no_comps'), `flags: ${breakdown.flags}`);
  assert.ok(!breakdown.flags.includes('genre_unknown'), `flags: ${breakdown.flags}`);
});
