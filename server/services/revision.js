// A monotonic revision counter bumped whenever the ticket list changes. Clients
// poll GET /api/revision (tiny) and reload when it changes — no persistent
// connections, so we never exhaust the browser's per-host connection limit.
let rev = 0;

export function bumpRevision() {
  rev += 1;
  return rev;
}

export function getRevision() {
  return rev;
}
