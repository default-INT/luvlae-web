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
        { label: siteFooter.shopOnAmazon, href: product.amazonUrl, external: true },
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
                    {'external' in link ? (
                      <a
                        href={link.href}
                        target='_blank'
                        rel='noopener noreferrer sponsored'
                        data-analytics-event='amazon_outbound_click'
                        data-analytics-location='footer'
                      >
                        {link.label}
                      </a>
                    ) : <Link href={link.href}>{link.label}</Link>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={styles.bottom}>
          <span>{interpolate(siteFooter.copyright, { year: new Date().getFullYear() })}</span>
          <span>{siteFooter.tagline}</span>
        </div>
      </div>
    </footer>
  );
};
