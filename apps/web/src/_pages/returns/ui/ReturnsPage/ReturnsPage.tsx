import Link from 'next/link';
import { Fragment } from 'react';

import { siteUrl } from '@/shared/config/site';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

interface PolicySection {
  title: string;
  paragraphs: Record<string, string>;
  items?: Record<string, string>;
}

export const ReturnsPage = async () => {
  const dictionary = await getDictionary(defaultLocale);
  const { returnsPage: copy, informationUi } = dictionary;
  const links = Object.values(copy.links);

  const renderText = (text: string) => text
    .split(/(Contact Us|www\.luvlae\.com|Returns & Refunds Policy)/g).map((part, index) => {
      const link = links.find(item => item.label === part);

      return link ? <Link key={index} href={link.href}>{part}</Link> : part;
    });

  const renderSections = (sections: Record<string, PolicySection>, nested = false) => Object.values(sections).map(section => (
    <section key={section.title}>
      {nested ? <h3>{section.title}</h3> : <h2>{section.title}</h2>}
      {Object.values(section.paragraphs).map((paragraph, index) => (
        <Fragment key={paragraph}>
          <p>{renderText(paragraph)}</p>
          {index === 0 && section.items && (
            <ul>{Object.values(section.items).map(item => <li key={item}>{item}</li>)}</ul>
          )}
        </Fragment>
      ))}
    </section>
  ));

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: informationUi.home, item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: copy.title, item: siteUrl('/returns') },
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
            <p>{renderText(copy.lead)}</p>
          </header>
          <div className={styles.article}>
            {renderSections(copy.sections)}
            <section className={styles.cancellation} aria-labelledby='cancellation-policy'>
              <h2 id='cancellation-policy'>{copy.cancellation.title}</h2>
              {renderSections(copy.cancellation.sections, true)}
            </section>
          </div>
        </div>
      </main>
      <SiteFooter dictionary={dictionary}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}/>
    </>
  );
};
