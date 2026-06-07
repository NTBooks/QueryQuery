import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCid, buildVerifyUrl } from '../server/services/chainletter.js';

// The whole feature is worthless if the locally-computed CID doesn't match what
// IPFS/Pinata produce. These are well-known IPFS CIDv0 reference values.
test('computeCid matches known IPFS CIDv0 references', async () => {
  assert.equal(await computeCid(Buffer.from('hello world')), 'Qmf412jQZiuVUtdgnB36FXFX7xg5V6KEbSJ4dpQuhkLyfD');
  assert.equal(await computeCid(Buffer.from('')), 'QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH');
});

test('buildVerifyUrl prefers an API-provided link, else fills the template', () => {
  const cl = { webhookUrl: 'https://srv.chainletter.io/webhook/k', verifyUrlTemplate: 'https://{server}/verify/{cid}' };
  assert.equal(buildVerifyUrl(cl, 'QmABC', { verifyUrl: 'https://x/y' }), 'https://x/y');
  assert.equal(buildVerifyUrl(cl, 'QmABC', null), 'https://srv.chainletter.io/verify/QmABC');
});
