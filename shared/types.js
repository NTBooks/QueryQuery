// JSDoc typedefs for editor hints (this is a JavaScript project, no TS build).
// Importing this file has no runtime effect; it exists purely for documentation.

/**
 * @typedef {Object} ComponentSpan
 * @property {boolean} present
 * @property {string} [text]
 * @property {[number, number]} [span] char offsets into the cleaned body
 */

/**
 * @typedef {Object} Components
 * @property {ComponentSpan & {personalized?:boolean, agentNamePresent?:boolean, massMail?:boolean}} salutation
 * @property {ComponentSpan} hook
 * @property {ComponentSpan & {hasCharacter?:boolean, hasGoal?:boolean, hasConflict?:boolean, hasStakes?:boolean, spoiler?:boolean}} pitch
 * @property {ComponentSpan & {titles?:string[], authors?:string[], years?:number[], count?:number}} comps
 * @property {ComponentSpan & {wordCount?:number|null, genreKey?:string|null, genreRaw?:string, title?:string, ageCategory?:string}} metadata
 * @property {ComponentSpan & {relevant?:boolean}} bio
 * @property {ComponentSpan & {hasContact?:boolean}} closing
 * @property {number} coverage 0..1 fraction of components detected
 * @property {number} wordCountBody approximate word count of the email body
 */

/**
 * @typedef {Object} MetricResult
 * @property {number} value 0..1 raw metric
 * @property {number} weight effective (renormalized) weight
 * @property {number} points value * weight
 */

/**
 * @typedef {Object} ScoreBreakdown
 * @property {Object<string, MetricResult>} metrics
 * @property {string[]} flags
 */

/**
 * @typedef {Object} Ticket
 * @property {number} id
 * @property {string} source_file
 * @property {string} from_addr
 * @property {string} from_name
 * @property {string} subject
 * @property {string} received_at
 * @property {string} body
 * @property {Components} components
 * @property {number} score 0..100
 * @property {string} score_band
 * @property {ScoreBreakdown} breakdown
 * @property {number} ai_suspicion 0..100
 * @property {boolean} ai_disclosed
 * @property {number} cliche_score 0..100
 * @property {string} status
 * @property {string|null} llm_summary
 * @property {Object|null} llm_triage
 * @property {string} config_hash
 */

export {};
