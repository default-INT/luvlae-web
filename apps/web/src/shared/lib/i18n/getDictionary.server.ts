import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { cache } from 'react';
import { parse } from 'yaml';

import { defaultLocale, dictionaryShape, type Dictionary, type Locale } from '@/shared/config/i18n';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertMatchingShape(reference: unknown, translation: unknown, path = 'dictionary') {
  if (typeof reference === 'string') {
    if (typeof translation !== 'string') {
      throw new Error(`Translation "${path}" must be a string.`);
    }

    return;
  }

  if (!isRecord(reference) || !isRecord(translation)) {
    throw new Error(`Translation "${path}" must match the base dictionary structure.`);
  }

  const referenceKeys = Object.keys(reference).sort();
  const translationKeys = Object.keys(translation).sort();

  if (referenceKeys.join(',') !== translationKeys.join(',')) {
    throw new Error(`Translation "${path}" must have the same keys as the base dictionary.`);
  }

  for (const key of referenceKeys) {
    assertMatchingShape(reference[key], translation[key], `${path}.${key}`);
  }
}

const loadDictionary = cache(async (locale: Locale): Promise<Dictionary> => {
  const messagesDirectory = join(process.cwd(), 'src/shared/config/i18n/messages');
  const dictionaryPath = join(messagesDirectory, `${locale}.yaml`);
  const dictionaryFile = await readFile(dictionaryPath, 'utf8');
  const dictionary = parse(dictionaryFile) as unknown;

  const baseDictionaryFile = locale === defaultLocale
    ? dictionaryFile
    : await readFile(join(messagesDirectory, `${defaultLocale}.yaml`), 'utf8');

  const baseDictionary = parse(baseDictionaryFile) as unknown;

  assertMatchingShape(dictionaryShape, baseDictionary);
  assertMatchingShape(baseDictionary, dictionary);

  return dictionary as Dictionary;
});

export function getDictionary(locale: Locale): Promise<Dictionary> {
  return loadDictionary(locale);
}
