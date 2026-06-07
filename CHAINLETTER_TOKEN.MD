# Chainletter token + stamping API — reference

How to go from a single Chainletter **token URL** to a working, blockchain-stamped
file — verified against the live API. Reference implementation:
[`server/services/chainletter.js`](server/services/chainletter.js).

---

## 1. The one thing the user provides

A **token URL** (a single-use shortlink):

```
https://{server}/jwt/{token}
# e.g. https://staging-service-link.clstamp.com/jwt/L1CJSb7Dq_o
```

That's the only field needed. Everything else (webhook URL, JWT, group, tenant) comes
from **claiming** it once.

> The `{server}` host here is a **pinproxy** — it serves *both* the human "Token
> Information" page (plain `GET`) *and* the webhook API. Don't confuse it with the
> *tenant* host (below), which is the public web app used for verification links.

---

## 2. Claim the token (ONCE) — bootstraps everything

`GET {tokenUrl}?claim=true` → JSON:

```jsonc
{
  "success": true,
  "tenant": "staging-diamond-soul.clstamp.com",          // public host (verify links)
  "webhookurl": "https://staging-service-link.clstamp.com/webhook/{apikey}", // USE VERBATIM
  "jwt": "eyJhbGciOi...",                                  // auth for webhook calls
  "groupname": "1-yourname",                               // the group-id header value
  "expires": "2026-07-07T19:31:59.698Z",
  "expires_in": 2577898
}
```

```bash
curl -s "https://{server}/jwt/{token}?claim=true"
```

**The claim is SINGLE-USE.** Claiming again returns `410 {"message":"Token no longer
available"}`. So **claim once, cache `{webhookurl, jwt, groupname, tenant, expires}`,
and reuse until `expires`** (~30 days here). A fresh session needs a new token URL.

Critical: the **real apikey lives inside `webhookurl`** (a UUID), *not* the short token
from the path. Do **not** hand-build `/webhook/{token}` — use `webhookurl` verbatim, or
you'll get `401 "Invalid API key"`.

---

## 3. Authenticate webhook calls

Every webhook call uses the JWT from the claim:

```
Authorization: Bearer {jwt}
```

(The API also accepts a traditional `secret-key: {secret}` header if you have a static
secret, but the shortlink flow gives you a JWT — use that.)

---

## 4. Compute the CID locally (optional cross-check)

The server returns the authoritative `hash` on upload, but you can verify it matches a
locally-computed **CIDv0** (`Qm…`, default UnixFS chunking — identical to `ipfs add`):

```js
import Hash from 'ipfs-only-hash';
const cid = await Hash.of(buffer, { cidVersion: 0 });
```

Reference values for self-testing: `hello world` →
`Qmf412jQZiuVUtdgnB36FXFX7xg5V6KEbSJ4dpQuhkLyfD`; empty file →
`QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH`.

---

## 5. Webhook API (base URL = `webhookurl`)

### a. Upload a file + stamp it — the working "certify" path ✅

A blockchain stamp requires a **stored file**. Upload as `network: private` (Chainletter
servers only — *not* public, *not* IPFS) or `network: public` (IPFS), and stamp in one call:

```
POST {webhookurl}                       (multipart/form-data)
Headers: Authorization: Bearer {jwt}
         group-id: {groupname}          (required)
         network: private               (or "public")
         stamp-immediately: true
Body:    file=<the bytes>
# DO NOT set Content-Type — let the HTTP client set the multipart boundary.
```

Response:

```json
{ "success": true, "message": "File uploaded and collection stamped successfully",
  "hash": "Qm…", "name": "...", "size": 1476, "network": "private", "files_stamped": 1 }
```

### b. Hash-only register (no upload) — CANNOT be stamped ⚠️

```
POST {webhookurl}  Content-Type: application/json
Headers: Authorization: Bearer {jwt}, group-id: {groupname}
Body:    {"hash":"Qm…","name":"...","size":N,"mimetype":"..."}
```

Returns `201 {"message":"Hash registered in group (no file uploaded)","network":"none"}`.
But a `network:none` entry has no stored file, so stamping it fails
(`"No files found in group to stamp"`, even with `stamp-immediately:true`). Use this only
to *record* a hash, never to get a blockchain postmark.

### c. Stamp an existing collection

```
PATCH {webhookurl}   Headers: Authorization: Bearer {jwt}, group-id: {groupname}
```
Stamps uploaded files in the group; `400 "No files found in group to stamp"` if there are none.

### d. Verify a hash (read-only)

```
GET {webhookurl}   Headers: Authorization: Bearer {jwt}, hash: {cid}
```
Send **only** the `hash` header — sending `group-id` *and* `hash` returns
`400 "Cannot specify both group id and hash unless you are exporting a link"`.

### Error reference (observed)

| Code | Meaning |
|---|---|
| 401 `Missing API key or secret key` | No auth header sent |
| 401 `Invalid API key` | Wrong apikey (e.g. used the path token instead of `webhookurl`) |
| 401 `Expired or invalid Authorization bearer token` | JWT expired/bad |
| 400 `No files found in group to stamp` | Tried to stamp a hash-only (no-file) entry |
| 400 `Cannot specify both group id and hash` | Verify must send `hash` only |
| 410 `Token no longer available` | The shortlink was already claimed — get a fresh one |

---

## 6. End-to-end (verified flow)

```
1. claim:  GET {tokenUrl}?claim=true -> { webhookurl, jwt, groupname, tenant, expires }   (cache it; single-use)
2. upload: POST {webhookurl}  (multipart: file)  Bearer jwt + group-id + network:private + stamp-immediately:true
           -> { success, hash, files_stamped, network }
3. link:   verify URL = https://{tenant}/verify/{hash}
```

### JS (this repo's helpers)

```js
import { resolveCredentials, certifyBytes } from './server/services/chainletter.js';
const cl = await resolveCredentials(config);                 // claims once, caches, reuses
const { hash, stamp, verifyUrl, network } = await certifyBytes(cl, {
  buffer: fs.readFileSync('query.eml'), name: 'query.eml', mimetype: 'message/rfc822',
});
```

---

## 7. Verification link

Built from the **tenant** host (the public web app), not the pinproxy:
`https://{tenant}/verify/{cid}`. Prefer any link the API returns in its response.

---

## 8. Gotchas

- **Claim is single-use** — cache the result; re-claiming 410s. Fresh session ⇒ fresh token URL.
- **Use `webhookurl` verbatim** — the apikey is in its path; don't rebuild it from the token.
- **Stamping needs an uploaded file** — hash-only register can't be stamped.
- **Don't set `Content-Type`** on the multipart upload (breaks the boundary).
- **Verify sends `hash` only** (no `group-id`).
- **private vs public**: private = Chainletter servers only (not verifiable by third parties / no IPFS); public = IPFS + publicly verifiable.
- **JWT expiry** — re-claim (new token URL) when `expires` passes; a 401 means expired/invalid.

---

## 9. Reference implementation (this repo)

- [`server/services/chainletter.js`](server/services/chainletter.js) — `claimToken`,
  `resolveCredentials` (claim+cache), `uploadAndStamp`, `certifyBytes`, `computeCid`,
  `buildVerifyUrl`, `testConnection`.
- [`server/configStore.js`](server/configStore.js) — `cacheChainletterClaim` (persists the single-use claim).
- [`server/routes/tickets.js`](server/routes/tickets.js) — `POST /api/tickets/:id/certify`.
- [`test/chainletter.test.js`](test/chainletter.test.js) — CID reference checks.
