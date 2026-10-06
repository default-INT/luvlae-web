import Link from 'next/link';

import { product } from '@/entities/product';
import { ActionLink } from '@/shared/ui/ActionLink';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

export interface SiteHeaderProps {
  dictionary: Dictionary;
}

export const SiteHeader = (props: SiteHeaderProps) => {
  const { dictionary } = props;
  const { siteHeader } = dictionary;

  const navigation = [
    { label: siteHeader.navigation.patches, href: '/products/berberine-patches' },
    { label: siteHeader.navigation.ingredients, href: '/ingredients' },
    { label: siteHeader.navigation.howToUse, href: '/how-to-use-berberine-patches' },
    { label: siteHeader.navigation.safety, href: '/berberine-patch-safety' },
    { label: siteHeader.navigation.science, href: '/science/berberine-patches' },
    { label: siteHeader.navigation.faq, href: '/faq' },
  ];

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href='/' className={styles.brand} aria-label={siteHeader.homeLabel}>
          LUVLAE<span className={styles.brandDot} aria-hidden='true'/>
        </Link>
        <nav className={styles.desktopNav} aria-label={siteHeader.navigationLabel}>
          {navigation.map(item => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <div className={styles.actions}>
          <ActionLink
            href={product.amazonUrl}
            external
            analyticsEvent='amazon_outbound_click'
            analyticsLocation='header'
          >
            {siteHeader.shopOnAmazon}
          </ActionLink>
          <details className={styles.mobileMenu}>
            <summary aria-label={siteHeader.openMenuLabel}><span/><span/><span/></summary>
            <nav aria-label={siteHeader.mobileNavigationLabel}>
              {navigation.map(item => <Link href={item.href} key={item.href}>{item.label}</Link>)}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
};
