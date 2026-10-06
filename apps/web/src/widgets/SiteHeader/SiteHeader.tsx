import Link from 'next/link';

import { product } from '@/entities/product';
import { ActionLink } from '@/shared/ui/ActionLink';

import styles from './styles.module.scss';

const navigation = [
  { label: 'The Patches', href: '/products/berberine-patches/' },
  { label: 'Ingredients', href: '/ingredients/' },
  { label: 'How to Use', href: '/how-to-use-berberine-patches/' },
  { label: 'Safety', href: '/berberine-patch-safety/' },
  { label: 'Science', href: '/science/berberine-patches/' },
  { label: 'FAQ', href: '/faq/' },
] as const;

export const SiteHeader = () => (
  <header className={styles.header}>
    <div className={styles.inner}>
      <Link href='/' className={styles.brand} aria-label='Luvlae home'>
        LUVLAE<span className={styles.brandDot} aria-hidden='true'/>
      </Link>
      <nav className={styles.desktopNav} aria-label='Main navigation'>
        {navigation.map(item => <Link href={item.href} key={item.href}>{item.label}</Link>)}
      </nav>
      <div className={styles.actions}>
        <ActionLink href={product.amazonUrl} external>Shop on Amazon</ActionLink>
        <details className={styles.mobileMenu}>
          <summary aria-label='Open navigation menu'><span/><span/><span/></summary>
          <nav aria-label='Mobile navigation'>
            {navigation.map(item => <Link href={item.href} key={item.href}>{item.label}</Link>)}
          </nav>
        </details>
      </div>
    </div>
  </header>
);
