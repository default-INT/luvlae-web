import Link from 'next/link';

import { CartButton } from '@/features/shopping-cart';

import { HeaderLink } from './ui/HeaderLink';
import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

export interface SiteHeaderProps {
  dictionary: Dictionary;
}

export const SiteHeader = (props: SiteHeaderProps) => {
  const { dictionary } = props;
  const { siteHeader } = dictionary;

  const navigation = [
    { label: siteHeader.navigation.aboutProduct, href: '/about-product' },
    { label: siteHeader.navigation.patches, href: '/products/berberine-patches?offer=best-value' },
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
          {navigation.map(item => <HeaderLink href={item.href} key={item.href}>{item.label}</HeaderLink>)}
        </nav>
        <div className={styles.actions}>
          <CartButton copy={dictionary.commerce}/>
          <details className={styles.mobileMenu}>
            <summary aria-label={siteHeader.openMenuLabel}><span/><span/><span/></summary>
            <nav aria-label={siteHeader.mobileNavigationLabel}>
              {navigation.map(item => <HeaderLink href={item.href} key={item.href}>{item.label}</HeaderLink>)}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
};
