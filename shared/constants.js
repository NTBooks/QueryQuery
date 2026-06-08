// Shared domain constants for QueryQuery.
// These encode the "publishing knowledge" the heuristic engine relies on.
// Everything here is plain data so it can be imported by the server, the
// sample-data scripts, and the React client alike.

/** The five Kanban states (columns), in agent-workflow order. */
export const STATES = [
  { key: 'did_not_review', label: 'Did not Review' },
  { key: 'reject', label: 'Reject' },
  { key: 'second_look', label: 'Second Look' },
  { key: 'accept', label: 'Accept' },
  { key: 'hold', label: 'Hold' },
];

export const STATUS_KEYS = STATES.map((s) => s.key);
export const DEFAULT_STATUS = 'did_not_review';

/** Swimlane score bands (rows), top → bottom. Overridable in config. */
export const DEFAULT_SCORE_BANDS = [
  { key: 'top', label: 'Top', min: 85, max: 100 },
  { key: 'strong', label: 'Strong', min: 70, max: 84 },
  { key: 'mixed', label: 'Mixed', min: 55, max: 69 },
  { key: 'weak', label: 'Weak', min: 40, max: 54 },
  { key: 'likely_reject', label: 'Lowest Match', min: 0, max: 39 },
];

/**
 * Genre taxonomy: detection aliases (matched longest-first) + default
 * debut word-count bands. Aliases are lowercase substrings.
 */
export const GENRE_DEFS = {
  // More-specific genres are listed before broad ones; detection respects
  // the `priority` (higher = matched first) so "historical romance" wins
  // over "romance", "ya fantasy" over "fantasy"/"young adult", etc.
  romantasy: { label: 'Romantasy', aliases: ['romantasy', 'romantic fantasy'], min: 90000, max: 110000, priority: 100 },
  ya_fantasy: { label: 'YA Fantasy', aliases: ['ya fantasy', 'young adult fantasy', 'ya sci-fi', 'young adult science fiction', 'ya speculative'], min: 75000, max: 90000, priority: 95 },
  ya_contemporary: { label: 'YA Contemporary', aliases: ['ya contemporary', 'young adult contemporary', 'contemporary ya', 'young adult', 'ya '], min: 60000, max: 75000, priority: 60 },
  mg_contemporary: { label: 'Middle Grade', aliases: ['middle grade', 'middle-grade', 'mg fantasy', 'mg '], min: 40000, max: 60000, priority: 70 },
  historical_rom: { label: 'Historical Romance', aliases: ['historical romance', 'regency romance'], min: 80000, max: 100000, priority: 90 },
  contemp_romance: { label: 'Romance', aliases: ['contemporary romance', 'romance', 'rom-com', 'romcom'], min: 70000, max: 90000, priority: 50 },
  sci_fi: { label: 'Science Fiction', aliases: ['science fiction', 'sci-fi', 'scifi', 'space opera', 'hard sf'], min: 90000, max: 110000, priority: 55 },
  fantasy: { label: 'Fantasy', aliases: ['epic fantasy', 'high fantasy', 'urban fantasy', 'dark fantasy', 'fantasy'], min: 90000, max: 120000, priority: 45 },
  thriller: { label: 'Thriller', aliases: ['psychological thriller', 'thriller', 'suspense'], min: 80000, max: 100000, priority: 52 },
  mystery: { label: 'Mystery', aliases: ['cozy mystery', 'mystery', 'crime fiction', 'crime', 'detective', 'whodunit'], min: 80000, max: 100000, priority: 51 },
  comedy: { label: 'Comedy / Humor', aliases: ['dark comedy', 'black comedy', 'tragicomedy', 'comic novel', 'satire', 'satirical', 'humorous fiction', 'comedy', 'humor'], min: 70000, max: 90000, priority: 56 },
  memoir: { label: 'Memoir / Nonfiction', aliases: ['memoir', 'narrative nonfiction', 'narrative non-fiction', 'nonfiction', 'non-fiction'], min: 70000, max: 90000, priority: 40 },
  picture_book: { label: 'Picture Book', aliases: ['picture book', 'picture-book'], min: 500, max: 1000, priority: 80 },
  adult_literary: { label: 'Literary Fiction', aliases: ['literary fiction', 'literary', 'upmarket fiction', 'book club fiction'], min: 80000, max: 95000, priority: 30 },
  commercial_fiction: { label: 'Commercial Fiction', aliases: ['commercial fiction', 'womens fiction', "women's fiction", 'general fiction'], min: 80000, max: 100000, priority: 25 },
};

export const GENRE_KEYS = Object.keys(GENRE_DEFS);

/** Lexicons used to detect pitch structure (character / goal / conflict / stakes). */
export const LEXICONS = {
  goal: ['must', 'wants', 'want', 'needs', 'set out', 'sets out', 'determined', 'dreams of', 'hopes to', 'in order to', 'desperate to', 'vows to', 'quest', 'mission', 'searches for', 'seeks'],
  conflict: ['but', 'however', 'until', 'when suddenly', 'unless', 'torn between', 'forced to', 'threatens', 'stands in', 'against', 'enemy', 'rival', 'betray', 'obstacle', 'struggle'],
  stakes: ['or else', 'risk', 'risks', 'lose', 'loses', 'death', 'die', 'dies', 'kill', 'killed', 'destroy', 'destroyed', 'everything', 'too late', 'at stake', 'consequences', 'survive', 'survival', 'the world', 'her life', 'his life', 'their lives'],
  // Crude proper-name / character hints: capitalized words mid-sentence, plus
  // explicit markers. (Full NER is overkill for a heuristic.)
  characterMarkers: ['year-old', 'protagonist', 'narrator', 'when she', 'when he', 'when they'],
};

/** Markers that a query reveals its ending (a common rejection trigger). */
export const SPOILER_MARKERS = ['in the end', 'finally discovers that', 'turns out that', 'the killer is', 'is revealed to be', 'ultimately learns that', 'the twist is', 'and saves the day', 'lives happily ever after', 'dies at the end'];

/** Positive personalization signals. */
export const PERSONALIZATION_MARKERS = ['#mswl', 'manuscript wishlist', 'wishlist', 'your interview', 'i read your', 'i saw your', 'i heard you', 'on your list', 'you represent', 'your client', 'i follow you', 'because you', 'your mswl', 'per your', 'your recent'];

/** Mass-mail / non-personalized salutations (negative signal). */
export const MASS_MAIL_SALUTATIONS = ['dear agent', 'dear agents', 'to whom it may concern', 'dear sir or madam', 'dear sir/madam', 'dear literary agent', 'hello agent', 'dear [agent', 'dear agent_name', 'dear {{'];

/** Unprofessional tone markers (negative signal in professionalism metric). */
export const UNPROFESSIONAL_MARKERS = [
  'guaranteed bestseller', 'will be a bestseller', 'next harry potter', 'next great american novel',
  'better than', 'rejected by', 'agents have rejected', 'other agents passed', 'sat on this for',
  'you would be foolish', "you'd be crazy", 'once in a lifetime', 'the next big thing',
  'sure to be a hit', 'movie deal', 'oprah', 'i have copyrighted', 'all rights reserved',
];

/** Author-bio relevance markers. */
export const BIO_RELEVANT_MARKERS = ['mfa', 'published in', 'my work has appeared', 'short story', 'short stories', 'debut', 'award', 'finalist', 'longlist', 'shortlist', 'journalist', 'phd', 'professor', 'editor', 'my first novel', 'represented by', 'magazine', 'anthology', 'pushcart'];

/** Author-bio personal-but-irrelevant markers (weak signal). */
export const BIO_PERSONAL_MARKERS = ['i live in', 'i have always loved', 'my cat', 'my dog', 'my children', 'my husband', 'my wife', 'retired', 'spare time', 'lifelong dream', 'since i was a child'];

/** Comp-title introduction phrases. */
export const COMP_MARKERS = ['comp titles', 'comparable titles', 'comps:', 'comp:', 'fans of', 'in the vein of', 'perfect for readers of', 'readers of', 'will appeal to fans of', 'meets', 'for readers who loved', 'in the tradition of', 'reminiscent of', 'comparable to', 'in the spirit of', 'for fans of'];

/** ~150-style AI vocabulary blocklist (defaults; user-editable in config). */
export const DEFAULT_AI_PHRASES = [
  'delve', 'tapestry', 'illuminate', 'navigate', 'navigating', 'harness', 'underscore', 'underscores',
  'pivotal', 'realm', 'realms', 'facilitate', 'foster', 'grapple', 'grapples', 'intertwine', 'intertwined',
  'endeavor', 'shed light on', 'showcase', 'showcases', 'embody', 'embodies', 'transcend', 'transcends',
  'testament to', 'rich tapestry', 'cultural tapestry', 'ever-evolving', 'ever-changing', 'multifaceted',
  'meticulous', 'meticulously', 'nuanced', 'profound', 'resonate', 'resonates', 'captivating', 'compelling narrative',
  'in the realm of', 'a journey', 'embark on a journey', 'unwavering', 'indelible', 'poignant', 'evocative',
];

/** Query-letter cliché blocklist (human boilerplate; tracked separately from AI). */
export const DEFAULT_CLICHE_PHRASES = [
  'i hope this email finds you well', 'i hope this finds you well', 'aspiring author', 'aspiring writer',
  'in a world where', 'have you ever wondered', 'have you ever imagined', 'trials and tribulations',
  'more than they bargained for', 'unputdownable', 'page-turner that will', 'the next ',
  'little did', 'against all odds', 'a roller coaster', 'edge of your seat', 'fast-paced page-turner',
  'this is a story about', 'a tale as old as time', 'will keep readers guessing',
];

/** AI-disclosure detection phrases (presence = a flag, not a penalty by default). */
export const AI_DISCLOSURE_MARKERS = [
  'no ai was used', 'no a.i. was used', 'written without ai', 'i did not use ai', 'i used ai', 'ai was used',
  'this query was written with', 'ai-assisted', 'ai assisted', 'tool-assisted', 'with the help of ai',
  'chatgpt', 'claude', 'gemini', 'copilot', 'large language model', 'generative ai', 'artificial intelligence was',
  'i used an ai', 'partially generated by ai', 'ai disclosure',
];

/** Emotion / affect words; their absence is one weak AI-suspicion signal. */
export const EMOTION_WORDS = ['love', 'hate', 'fear', 'afraid', 'angry', 'rage', 'joy', 'grief', 'heartbreak', 'heartbroken', 'desperate', 'terrified', 'hope', 'hopeless', 'lonely', 'ashamed', 'guilt', 'vulnerable', 'doubt', 'longing', 'ache', 'tender', 'furious', 'thrilled', 'devastated'];

/** Common English contractions; very low frequency is a weak AI-suspicion signal. */
export const CONTRACTION_RE = /\b(\w+'(t|s|re|ve|ll|d|m)|can't|won't|don't|i'm|it's|that's|there's|we're|they're|you're|he's|she's|isn't|aren't|wasn't|weren't|didn't|doesn't|couldn't|wouldn't|shouldn't)\b/gi;

/** Canonical query component keys (for coverage scoring + UI highlighting). */
export const COMPONENT_KEYS = ['salutation', 'hook', 'pitch', 'comps', 'metadata', 'bio', 'closing'];

/** Human-readable labels for scoring metrics (used in UI breakdowns). */
export const METRIC_LABELS = {
  wordCountFit: 'Word-count fit',
  genreFit: 'Genre fit',
  personalization: 'Personalization',
  compQuality: 'Comp titles',
  pitchStructure: 'Pitch structure',
  professionalism: 'Professionalism',
  keywordMatch: 'Keyword match',
  authorBio: 'Author bio',
  componentCoverage: 'Component coverage',
};

/** Human-readable labels for flags surfaced on cards / drawers. */
export const FLAG_LABELS = {
  wordcount_out_of_range: 'Word count out of range',
  wordcount_unknown: 'No word count found',
  genre_unwanted: 'Genre not on wishlist',
  genre_unknown: 'Genre unclear',
  no_personalization: 'Not personalized',
  mass_mail: 'Mass-mail markers',
  no_comps: 'No comp titles',
  outdated_comps: 'Outdated comps',
  weak_pitch: 'Weak pitch structure',
  spoiler_reveal: 'Reveals the ending',
  unprofessional: 'Unprofessional tone',
  too_short: 'Too short',
  too_long: 'Too long',
  missing_components: 'Missing components',
  avoid_keyword: 'Contains avoided keyword',
  wanted_keyword: 'Matches wanted keyword',
  ai_disclosed: 'AI disclosure present',
  high_ai_suspicion: 'Possible AI indicators',
};
