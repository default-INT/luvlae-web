export const money = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
}).format(amount / 100);
