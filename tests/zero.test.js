// Where positions along the car are measured from: a display choice saved with the design.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDesign, cleanDesign } from '../src/model.js';

test('the rear axle as zero is saved with the design; anything else reads as the front axle', () => {
  const d = newDesign('1/32');
  assert.equal(d.zero, 'front');
  d.zero = 'rear';
  assert.equal(cleanDesign(JSON.parse(JSON.stringify(d))).zero, 'rear');
  assert.equal(cleanDesign({ ...JSON.parse(JSON.stringify(d)), zero: 'middle' }).zero, 'front');
  const { zero, ...older } = JSON.parse(JSON.stringify(d));
  assert.equal(cleanDesign(older).zero, 'front', 'a design saved before the choice existed');
});
