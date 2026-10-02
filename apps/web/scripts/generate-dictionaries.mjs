import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'yaml';

const appDirectory = join(import.meta.dirname, '..');
const messagesDirectory = join(appDirectory, 'src/shared/config/i18n/messages');
const outputPath = join(appDirectory, 'src/shared/config/i18n/dictionary-sources.json');
const messageFiles = (await readdir(messagesDirectory, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.yaml'))
  .sort((first, second) => first.name.localeCompare(second.name));

if (messageFiles.length === 0) {
  throw new Error(`No YAML dictionaries were found in ${messagesDirectory}.`);
}

const dictionaries = {};

for (const messageFile of messageFiles) {
  const locale = messageFile.name.slice(0, -'.yaml'.length);
  const yamlSource = await readFile(join(messagesDirectory, messageFile.name), 'utf8');
  const dictionary = parse(yamlSource);

  if (typeof dictionary !== 'object' || dictionary === null || Array.isArray(dictionary)) {
    throw new Error(`Dictionary ${messageFile.name} must contain a YAML object.`);
  }

  dictionaries[locale] = dictionary;
}

await writeFile(outputPath, `${JSON.stringify(dictionaries, null, 2)}\n`);
