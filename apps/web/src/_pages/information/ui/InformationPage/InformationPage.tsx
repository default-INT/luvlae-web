import Link from 'next/link';

import { product } from '@/entities/product';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { ActionLink } from '@/shared/ui/ActionLink';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

import type { InformationPageContent } from '../../model/pages';

export interface InformationPageProps {
  content: InformationPageContent;
}

export const InformationPage = async (props: InformationPageProps) => {
  const { content } = props;
  const dictionary = await getDictionary(defaultLocale);
  const { informationUi } = dictionary;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://luvlae.com/' },
      { '@type': 'ListItem', position: 2, name: content.title, item: `https://luvlae.com${content.path}` },
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
            <span aria-current='page'>{content.title}</span>
          </nav>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>{content.eyebrow}</p>
            <h1>{content.title}</h1>
            <p>{content.lead}</p>
          </div>
          <div className={styles.body}>
            <div className={styles.article}>
              {content.sections.map(section => (
                <section key={section.title}>
                  <h2>{section.title}</h2>
                  {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                </section>
              ))}
              {content.verificationNote && (
                <aside className={styles.verificationNote}>
                  <h2>{informationUi.stillVerifying}</h2>
                  <p>{content.verificationNote}</p>
                </aside>
              )}
              {content.sources && (
                <section className={styles.sources}>
                  <h2>{informationUi.sources}</h2>
                  <ul>
                    {content.sources.map(source => (
                      <li key={source.href}>
                        <a href={source.href} target='_blank' rel='noopener noreferrer'>{source.label}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <aside className={styles.sidebar}>
              <p className={styles.asideLabel}>{informationUi.keepExploring}</p>
              <h2>{informationUi.informedChoice}</h2>
              <p>{informationUi.sidebarDescription}</p>
              <div className={styles.asideLinks}>
                <Link href='/products/berberine-patches'>{informationUi.productDetails}</Link>
                <Link href='/ingredients'>{informationUi.ingredients}</Link>
                <Link href='/how-to-use-berberine-patches'>{informationUi.howToUse}</Link>
                <Link href='/berberine-patch-safety'>{informationUi.safety}</Link>
                <Link href='/science/berberine-patches'>{informationUi.science}</Link>
              </div>
              <ActionLink
                href={product.amazonUrl}
                external
                analyticsEvent='amazon_outbound_click'
                analyticsLocation='information_sidebar'
              >
                {informationUi.viewOnAmazon}
              </ActionLink>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter dictionary={dictionary}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}/>
    </>
  );
};
