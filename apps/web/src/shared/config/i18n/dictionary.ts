export const dictionaryShape = {
  home: {
    eyebrow: '',
    title: '',
    description: '',
  },
  metadata: {
    title: '',
    description: '',
  },
} as const;

type WidenStrings<T> = T extends string
  ? string
  : { [Key in keyof T]: WidenStrings<T[Key]> };

export type Dictionary = WidenStrings<typeof dictionaryShape>;
