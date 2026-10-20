
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import { OrderResult } from '../OrderResult';

import type { GuestOrder } from '@/entities/order';

interface Props { id: string; order: GuestOrder }

export const OrderPage = async (props: Props) => {
  const { id, order } = props;
  const dictionary = await getDictionary(defaultLocale);
  return (
    <>
      <SiteHeader dictionary={dictionary}/>
      <OrderResult id={id} order={order} copy={dictionary.commerce}/>
      <SiteFooter dictionary={dictionary}/>
    </>
  );
};
