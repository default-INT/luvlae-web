import Link from 'next/link';
import { Fragment } from 'react';

import { siteUrl } from '@/shared/config/site';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

export const ShippingPage = async () => {
  const dictionary = await getDictionary(defaultLocale);
  const { shippingPage: copy, informationUi } = dictionary;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: informationUi.home, item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: copy.title, item: siteUrl('/shipping') },
    ],
  };

  return (
    <>
      <SiteHeader dictionary={dictionary}/>
      <main className={styles.main}>
        <div className={styles.container}>
          <nav className={styles.breadcrumb} aria-label={informationUi.breadcrumbLabel}>
            <Link href='/'>{informationUi.home}</Link>
            <span aria-hidden='true'>/</span>
            <span aria-current='page'>{copy.title}</span>
          </nav>
          <header className={styles.intro}>
            <h1>{copy.title}</h1>
            <p>{copy.lead}</p>
          </header>
          <div className={styles.article}>
            {Object.values(copy.sections).map(section => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                {Object.values(section.paragraphs).map(paragraph => (
                  <p key={paragraph}>
                    {paragraph.split(copy.contactLinkLabel).map((part, index) => (
                      <Fragment key={index}>
                        {index > 0 && <Link href='/contact'>{copy.contactLinkLabel}</Link>}
                        {part}
                      </Fragment>
                    ))}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter dictionary={dictionary}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}/>
    </>
  );
};
