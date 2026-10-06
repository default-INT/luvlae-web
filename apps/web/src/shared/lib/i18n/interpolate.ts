export type InterpolationValues = Record<string, string | number>;

export const interpolate = (template: string, values: InterpolationValues): string =>
  template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (placeholder, key: string) => {
    const value = values[key];

    return value === undefined ? placeholder : String(value);
  });
