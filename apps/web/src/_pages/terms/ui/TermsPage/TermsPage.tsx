import Link from 'next/link';
import { Fragment } from 'react';

import { siteUrl } from '@/shared/config/site';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

export const TermsPage = async () => {
  const dictionary = await getDictionary(defaultLocale);
  const { termsPage: copy, informationUi } = dictionary;

  const renderText = (text: string) => text
    .split(/(www\.luvlae\.com|EverMotion Parts LLC|Luvlae|luvlae\.care@gmail\.com)/g).map((part, index) => {
      if (part === 'www.luvlae.com') {
        return <a key={index} href='https://www.luvlae.com/'>{part}</a>;
      }

      if (part === dictionary.contactPage.email) {
        return <a key={index} href={`mailto:${dictionary.contactPage.email}`}>{part}</a>;
      }

      if (part === 'EverMotion Parts LLC' || part === 'Luvlae') {
        return <strong key={index}>{part}</strong>;
      }

      return part;
    });

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: informationUi.home, item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: copy.title, item: siteUrl('/terms') },
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
            <p className={styles.updated}>
              <strong>{copy.updatedLabel}: <time dateTime='2026-10-21'>{copy.updatedDate}</time></strong>
            </p>
            {Object.values(copy.introduction).map(paragraph => <p key={paragraph}>{renderText(paragraph)}</p>)}
          </header>
          <div className={styles.article}>
            {Object.entries(copy.sections).map(([key, section]) => (
              <section key={key}>
                <h2>{section.title}</h2>
                {Object.values(section.paragraphs).map((paragraph, index) => (
                  <Fragment key={paragraph}>
                    <p>{renderText(paragraph)}</p>
                    {key === 'policies' && index === 0 && (
                      <ul>
                        {Object.values(copy.relatedPolicies).map(policy => (
                          <li key={policy.label}>
                            <strong>
                              <Link href={policy.href}>{policy.label}</Link>:
                            </strong>{' '}
                            {policy.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Fragment>
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
