import Link from 'next/link';

import { product } from '@/entities/product';
import { interpolate } from '@/shared/lib/i18n';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

export interface SiteFooterProps {
  dictionary: Dictionary;
}

export const SiteFooter = (props: SiteFooterProps) => {
  const { dictionary } = props;
  const { siteFooter } = dictionary;

  const groups = [
    {
      title: siteFooter.productGroup,
      links: [
        { label: siteFooter.aboutProduct, href: '/about-product' },
        { label: siteFooter.product, href: '/products/berberine-patches' },
        { label: siteFooter.ingredients, href: '/ingredients' },
        { label: siteFooter.howToUse, href: '/how-to-use-berberine-patches' },
      ],
    },
    {
      title: siteFooter.educationGroup,
      links: [
        { label: siteFooter.science, href: '/science/berberine-patches' },
        { label: siteFooter.safety, href: '/berberine-patch-safety' },
        { label: siteFooter.faq, href: '/faq' },
      ],
    },
    {
      title: siteFooter.exploreGroup,
      links: [
        { label: siteFooter.about, href: '/about' },
        { label: siteFooter.contact, href: '/contact' },
        { label: siteFooter.shipping, href: '/shipping' },
        { label: siteFooter.returns, href: '/returns' },
        { label: dictionary.returnsPage.cancellation.title, href: '/returns#cancellation-policy' },
        { label: siteFooter.terms, href: '/terms' },
        { label: siteFooter.privacy, href: '/privacy' },
        { label: siteFooter.shopOnAmazon, href: product.path },
      ],
    },
  ];

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.grid}>
          <div className={styles.brandBlock}>
            <Link href='/' className={styles.brand}>LUVLAE<span aria-hidden='true'>.</span></Link>
            <p>{interpolate(siteFooter.brandDescription, { productName: siteFooter.product })}</p>
          </div>
          {groups.map(group => (
            <div className={styles.group} key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.links.map(link => (
                  <li key={link.label}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={styles.bottom}>
          <div className={styles.copyright}>
            <span>{interpolate(siteFooter.copyright, { year: new Date().getFullYear() })}</span>
            <a
              className={styles.emailLink}
              href={`mailto:${dictionary.contactPage.email}`}
              aria-label={siteFooter.emailLabel}
              title={dictionary.contactPage.email}
            >
              <svg
                width='16' height='16' viewBox='0 0 24 24' fill='none'
                stroke='currentColor' strokeWidth='1.5' aria-hidden='true'
              >
                <rect x='3' y='5' width='18' height='14' rx='3'/>
                <path d='m4 7 8 6 8-6'/>
              </svg>
            </a>
          </div>
          <span>{siteFooter.tagline}</span>
        </div>
      </div>
    </footer>
  );
};
