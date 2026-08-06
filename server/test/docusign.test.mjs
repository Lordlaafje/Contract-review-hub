/**
 * Envelope-builder tests — the draft-only policy is enforced in code and
 * must never regress: envelopes are created with status 'created', never 'sent'.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnvelopeDefinition } from '../docusign.mjs';

const req = {
  signerEmail: 'signer@acme.example', signerName: 'Jan Signer',
  counterpartyName: 'Acme B.V.', contractType: 'NDA', contractFileName: 'nda.pdf',
};
const bytes = Buffer.from('pdf-bytes');

test('POLICY: envelopes are drafts (status created), never auto-sent', () => {
  assert.equal(buildEnvelopeDefinition(req, bytes).status, 'created');
});

test('signer is recipient 1 at routing order 1', () => {
  const s = buildEnvelopeDefinition(req, bytes).recipients.signers[0];
  assert.equal(s.email, 'signer@acme.example');
  assert.equal(s.recipientId, '1');
  assert.equal(s.routingOrder, '1');
});

test('anchor tab cannot fail envelope creation (ignore-if-not-present)', () => {
  const tab = buildEnvelopeDefinition(req, bytes).recipients.signers[0].tabs.signHereTabs[0];
  assert.equal(tab.anchorIgnoreIfNotPresent, 'true');
});

test('document carries the upload with the right extension', () => {
  const pdf = buildEnvelopeDefinition(req, bytes).documents[0];
  assert.equal(pdf.fileExtension, 'pdf');
  assert.equal(pdf.documentBase64, bytes.toString('base64'));

  const docx = buildEnvelopeDefinition({ ...req, contractFileName: 'contract.DOCX' }, bytes).documents[0];
  assert.equal(docx.fileExtension, 'docx');
});

test('email subject names the counterparty and type', () => {
  const e = buildEnvelopeDefinition(req, bytes);
  assert.match(e.emailSubject, /Acme B\.V\./);
  assert.match(e.emailSubject, /NDA/);
});
