import Image from 'next/image';
import Link from 'next/link';

import { siteUrl } from '@/shared/config/site';
import { ActionLink } from '@/shared/ui/ActionLink';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface AboutSection {
  title: string;
  paragraphs: Record<string, string>;
}

export interface AboutPageContent {
  title: string;
  eyebrow: string;
  headline: string;
  lead: string;
  imageAlt: string;
  idea: AboutSection;
  simplicity: AboutSection;
  values: {
    title: string;
    items: Record<string, { title: string; description: string }>;
  };
  approach: AboutSection;
  support: AboutSection;
  productButton: string;
  contactButton: string;
  refundLink: string;
}

export interface AboutPageProps {
  dictionary: Dictionary;
  content: AboutPageContent;
}

export const AboutPage = (props: AboutPageProps) => {
  const { dictionary, content } = props;
  const { informationUi } = dictionary;

  const resources = [
    { href: '/about-product', label: informationUi.productDetails },
    { href: '/ingredients', label: informationUi.ingredients },
    { href: '/how-to-use-berberine-patches', label: informationUi.howToUse },
    { href: '/berberine-patch-safety', label: informationUi.safety },
    { href: '/science/berberine-patches', label: informationUi.science },
  ];

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: informationUi.home, item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: content.title, item: siteUrl('/about') },
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
          <header className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>{content.eyebrow}</p>
              <h1>{content.headline}</h1>
              <p className={styles.lead}>{content.lead}</p>
              <ActionLink href='/products/berberine-patches'>{content.productButton}</ActionLink>
            </div>
            <div className={styles.heroImage}>
              <Image
                src='/images/luvlae-berberine-woman-with-patches.webp'
                alt={content.imageAlt}
                width={1280}
                height={853}
                sizes='(max-width: 800px) calc(100vw - 40px), min(50vw, 620px)'
                priority
              />
            </div>
          </header>
          <div className={styles.philosophy}>
            {[content.idea, content.simplicity].map(section => (
              <section className={styles.copy} key={section.title}>
                <h2>{section.title}</h2>
                {Object.values(section.paragraphs).map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              </section>
            ))}
          </div>
        </div>
        <section className={styles.values} aria-labelledby='about-values'>
          <div className={styles.container}>
            <h2 id='about-values'>{content.values.title}</h2>
            <div className={styles.valueGrid}>
              {Object.values(content.values.items).map(item => (
                <article className={styles.valueCard} key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <div className={styles.container}>
          <div className={styles.approach}>
            <section className={styles.copy} aria-labelledby='about-approach'>
              <h2 id='about-approach'>{content.approach.title}</h2>
              {Object.values(content.approach.paragraphs).map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            </section>
            <aside className={styles.resources} aria-labelledby='about-resources'>
              <h2 id='about-resources'>{informationUi.keepExploring}</h2>
              <ul>
                {resources.map(resource => (
                  <li key={resource.href}><Link href={resource.href}>{resource.label}</Link></li>
                ))}
              </ul>
            </aside>
          </div>
          <section className={styles.support} aria-labelledby='about-support'>
            <h2 id='about-support'>{content.support.title}</h2>
            {Object.values(content.support.paragraphs).map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            <div className={styles.actions}>
              <ActionLink href='/products/berberine-patches'>{content.productButton}</ActionLink>
              <ActionLink href='/contact' variant='outline'>{content.contactButton}</ActionLink>
            </div>
            <Link className={styles.refundLink} href='/returns'>{content.refundLink}</Link>
          </section>
        </div>
      </main>
      <SiteFooter dictionary={dictionary}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}/>
    </>
  );
};
