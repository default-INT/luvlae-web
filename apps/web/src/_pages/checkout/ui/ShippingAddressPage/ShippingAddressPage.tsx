import { ShippingAddressForm } from '@/features/shopping-cart';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

export const ShippingAddressPage = async () => {
  const dictionary = await getDictionary(defaultLocale);

  return <>
    <SiteHeader dictionary={dictionary}/>
    <main className={styles.main}>
      <h1>{dictionary.commerce.shippingAddressTitle}</h1>
      <ShippingAddressForm copy={dictionary.commerce}/>
    </main>
    <SiteFooter dictionary={dictionary}/>
  </>;
};
