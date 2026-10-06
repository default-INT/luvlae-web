import Image from 'next/image';
import Link from 'next/link';

import { product } from '@/entities/product';
import { ActionLink } from '@/shared/ui/ActionLink';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

import type { InformationPageContent } from '../../model/pages';

export interface InformationPageProps {
  content: InformationPageContent;
}

export const InformationPage = (props: InformationPageProps) => {
  const { content } = props;

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
      <SiteHeader/>
      <main className={styles.main}>
        <div className={styles.container}>
          <nav className={styles.breadcrumb} aria-label='Breadcrumb'>
            <Link href='/'>Home</Link><span aria-hidden='true'>/</span><span aria-current='page'>{content.title}</span>
          </nav>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>{content.eyebrow}</p>
            <h1>{content.title}</h1>
            <p>{content.lead}</p>
          </div>
          {content.image && (
            <div className={styles.productImage}>
              <Image
                src='/images/open-luvlae-berberine-patches-box.jpg'
                alt='Open Luvlae Berberine Patches box with individual patches'
                width={512}
                height={279}
                priority
              />
            </div>
          )}
          <div className={styles.body}>
            <div className={styles.article}>
              {content.sections.map(section => (
                <section key={section.title}>
                  <h2>{section.title}</h2>
                  {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                </section>
              ))}
            </div>
            <aside className={styles.sidebar}>
              <p className={styles.asideLabel}>Keep exploring</p>
              <h2>Make an informed choice</h2>
              <p>Explore the product, current use guidance, safety, and the limits of available research.</p>
              <div className={styles.asideLinks}>
                <Link href='/products/berberine-patches/'>Product details</Link>
                <Link href='/ingredients/'>Ingredients</Link>
                <Link href='/how-to-use-berberine-patches/'>How to use</Link>
                <Link href='/berberine-patch-safety/'>Safety</Link>
                <Link href='/science/berberine-patches/'>Science</Link>
              </div>
              <ActionLink href={product.amazonUrl} external>View on Amazon</ActionLink>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}/>
    </>
  );
};
