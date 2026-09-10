---
slopscore: 1
ai_generated: mostly
human_touch: heavy
content_rating: everyone
contains: [scraping]
category: [productivity, web-app, data]
status: works-on-my-machine
interface: [web]
frameworks: [react, vite, express, chakra-ui]
platforms: [windows, linux, macos, docker]
audience: [end-users]
data: [local-only]
needs: [lm-studio]
domain: [publishing, literary-agents, slush-pile]
tags: [query-letters, eml, kanban, heuristics, no-ai-required]
---
A helpdesk-style triage board for a literary agent's slush pile. Point it at a folder of query-letter `.eml` files and every letter is split into its parts, scored by a transparent heuristic engine you can edit, and laid out on a Kanban board with score-band swimlanes.

Built for agents who are skeptical of AI, so the AI is optional: a local model can add summaries and a second opinion but never overrides the rules. Ships with 120 synthetic sample letters so you can try it without real queries. The commit history is a string of slop puns; the disclosure above is the honest version.
