import dictionarySources from './dictionary-sources.json';

export const dictionaryShape = dictionarySources.en;

type WidenStrings<T> = T extends string
  ? string
  : { [Key in keyof T]: WidenStrings<T[Key]> };

export type Dictionary = WidenStrings<typeof dictionaryShape>;
