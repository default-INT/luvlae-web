import Link from 'next/link';

import { product } from '@/entities/product';

import styles from './styles.module.scss';

const groups = [
  {
    title: 'Product',
    links: [
      { label: 'Berberine Patches', href: '/products/berberine-patches/' },
      { label: 'Ingredients', href: '/ingredients/' },
      { label: 'How to Use', href: '/how-to-use-berberine-patches/' },
    ],
  },
  {
    title: 'Education & Trust',
    links: [
      { label: 'Science & Evidence', href: '/science/berberine-patches/' },
      { label: 'Safety', href: '/berberine-patch-safety/' },
      { label: 'Frequently Asked Questions', href: '/faq/' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { label: 'About Luvlae', href: '/about/' },
      { label: 'Shop on Amazon', href: product.amazonUrl, external: true },
    ],
  },
] as const;

export const SiteFooter = () => (
  <footer className={styles.footer}>
    <div className={styles.inner}>
      <div className={styles.grid}>
        <div className={styles.brandBlock}>
          <Link href='/' className={styles.brand}>LUVLAE<span aria-hidden='true'>.</span></Link>
          <p>Simple routines, thoughtfully considered. Explore the patch format and the information that helps you decide.</p>
          <p className={styles.asin}>Amazon ASIN: {product.asin}</p>
        </div>
        {groups.map(group => (
          <div className={styles.group} key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.links.map(link => (
                <li key={link.label}>
                  {'external' in link ? (
                    <a href={link.href} target='_blank' rel='noopener noreferrer sponsored'>{link.label}</a>
                  ) : <Link href={link.href}>{link.label}</Link>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={styles.notice}>
        Information on this site is educational and does not replace advice from a healthcare professional.
        Follow the directions and warnings on the current product package. Amazon handles purchases,
        shipping, and returns for orders placed there.
      </div>
      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} Luvlae. All rights reserved.</span>
        <span>Made for a more informed everyday routine.</span>
      </div>
    </div>
  </footer>
);
