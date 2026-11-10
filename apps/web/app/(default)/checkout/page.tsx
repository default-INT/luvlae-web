import { ShippingAddressPage } from '@/_pages/checkout';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Delivery address | Luvlae', robots: { index: false, follow: false } };

export default function ShippingAddressRoute() {
  return <ShippingAddressPage/>;
}
