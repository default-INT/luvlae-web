import Link from 'next/link';

import { siteUrl } from '@/shared/config/site';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

export const PrivacyPage = async () => {
  const dictionary = await getDictionary(defaultLocale);
  const { privacyPage: copy, informationUi } = dictionary;

  const renderText = (text: string) => text
    .split(/(www\.luvlae\.com|https:\/\/stripe\.com\/privacy|luvlae\.care@gmail\.com)/g).map((part, index) => {
      if (part === 'www.luvlae.com') {
        return <a key={index} href='https://www.luvlae.com/'>{part}</a>;
      }

      if (part === 'https://stripe.com/privacy') {
        return <a key={index} href={part}>{part}</a>;
      }

      if (part === dictionary.contactPage.email) {
        return <a key={index} href={`mailto:${dictionary.contactPage.email}`}>{part}</a>;
      }

      return part;
    });

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: informationUi.home, item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: copy.title, item: siteUrl('/privacy') },
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
              <strong>{copy.updatedLabel}: <time dateTime='2026-10-20'>{copy.updatedDate}</time></strong>
            </p>
            <p>{renderText(copy.introduction)}</p>
          </header>
          <div className={styles.article}>
            {Object.values(copy.sections).map(section => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                {Object.values(section.before).map(paragraph => <p key={paragraph}>{renderText(paragraph)}</p>)}
                {Object.keys(section.items).length > 0 && (
                  <ul>{Object.values(section.items).map(item => <li key={item}>{renderText(item)}</li>)}</ul>
                )}
                {Object.values(section.after).map(paragraph => <p key={paragraph}>{renderText(paragraph)}</p>)}
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
