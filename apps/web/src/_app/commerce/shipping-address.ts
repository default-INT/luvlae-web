import { z } from 'zod';

export const contiguousStates = ['AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
  'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'] as const;

const text = (maximum: number) => z.string().trim().min(1).max(maximum).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
export const shippingAddressSchema = z.strictObject({
  recipientName: text(100), line1: text(200), line2: text(200).optional(), city: text(100),
  state: z.string().trim().toUpperCase().pipe(z.enum(contiguousStates)),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/).refine(value => {
    const prefix = Number(value.slice(0, 3));
    return prefix > 0 && !(prefix >= 6 && prefix <= 9) && !(prefix >= 90 && prefix <= 98) && prefix !== 340
      && !(prefix >= 962 && prefix <= 969) && prefix < 995;
  }), country: z.literal('US'),
});
