import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getDictionary } from '../src/shared/lib/i18n/index.server';

// Exercise the server loader, including its recursive runtime shape validation.
test('English storefront dictionary loads About copy through the real server loader', async () => {
  const dictionary = await getDictionary('en');

  assert.equal(dictionary.aboutPage.headline, 'Small steps. A routine of your own.');
  assert.equal(Object.values(dictionary.aboutPage.idea.paragraphs).length, 2);
  assert.equal(Object.values(dictionary.aboutPage.simplicity.paragraphs).length, 2);
  assert.equal(Object.values(dictionary.aboutPage.values.items).length, 4);
  assert.equal(Object.values(dictionary.aboutPage.approach.paragraphs).length, 2);
  assert.equal(Object.values(dictionary.aboutPage.support.paragraphs).length, 1);
});
