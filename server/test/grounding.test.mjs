/**
 * Citation-grounding check: clause references are left alone, quotes must be in the text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGrounded } from '../review.mjs';

const src = 'processor may engage sub-processors and shall publish an updated list on its website.';

test('single and grouped clause references are not treated as quotes', () => {
  for (const loc of ['art. 4', 'Article 12.3', 'cl. 9', 'arts. 2, 4, 6, 7, 9, 11', 'Sections 3 and 5',
    'clauses 2–4', '§§ 3-5', 'paras. 1 & 2', 'Schedules 1, 2', 'not found in document']) {
    assert.deepEqual(checkGrounded(loc, src), { verifiable: false, grounded: true }, loc);
  }
});

test('a quote is verified when it is in the contract and flagged when it is not', () => {
  assert.equal(checkGrounded('"shall publish an updated list on its website"', src).grounded, true);
  const fake = checkGrounded('"processor must obtain prior written consent for every sub-processor"', src);
  assert.deepEqual(fake, { verifiable: true, grounded: false });
});

test('a word that merely starts like a clause keyword is still checked as a quote', () => {
  assert.equal(checkGrounded('articulated obligations of the processor', src).verifiable, true);
});
