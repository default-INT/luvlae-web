import Image from 'next/image';

import { product } from '@/entities/product';
import { ActionLink } from '@/shared/ui/ActionLink';
import { LineBreakText } from '@/shared/ui/LineBreakText';
import { Reveal } from '@/shared/ui/Reveal';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import { SectionHeading } from '../SectionHeading';
import { InfoCard } from '../InfoCard';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': 'https://luvlae.com/#organization',
  name: 'Luvlae',
  url: 'https://luvlae.com/',
};

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Luvlae',
  url: 'https://luvlae.com/',
  publisher: { '@id': 'https://luvlae.com/#organization' },
};

export interface HomePageProps {
  dictionary: Dictionary;
}

export const HomePage = (props: HomePageProps) => {
  const { dictionary } = props;
  const { home } = dictionary;

  const benefits = [
    { ...home.benefits.one, icon: '/images/icons/pill-free-format-icon.svg', iconWidth: 20, iconHeight: 20 },
    { ...home.benefits.two, icon: '/images/icons/portability-leaf-icon.svg', iconWidth: 20, iconHeight: 20 },
    { ...home.benefits.three, icon: '/images/icons/skin-comfort-icon.svg', iconWidth: 16, iconHeight: 20 },
    { ...home.benefits.four, icon: '/images/icons/product-information-icon.svg', iconWidth: 20, iconHeight: 20 },
  ];

  const resources = [
    {
      ...home.resources.one,
      href: '/ingredients',
      icon: '/images/icons/ingredients-guide-icon.svg',
      iconWidth: 22,
      iconHeight: 21,
    },
    {
      ...home.resources.two,
      href: '/how-to-use-berberine-patches',
      icon: '/images/icons/patch-use-guide-icon.svg',
      iconWidth: 22,
      iconHeight: 21,
    },
    {
      ...home.resources.three,
      href: '/berberine-patch-safety',
      icon: '/images/icons/patch-safety-guide-icon.svg',
      iconWidth: 22,
      iconHeight: 21,
    },
    {
      ...home.resources.four,
      href: '/science/berberine-patches',
      icon: '/images/icons/berberine-research-guide-icon.svg',
      iconWidth: 21,
      iconHeight: 24,
    },
  ];

  return (
    <>
      <SiteHeader dictionary={dictionary}/>
      <main>
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroLayout}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>{home.eyebrow}</p>
                <h1><LineBreakText text={home.title}/></h1>
                <p className={styles.heroDescription}>{home.description}</p>
                <div className={styles.heroAction}>
                  <ActionLink href='/products/berberine-patches'>{home.heroButton}</ActionLink>
                  <p>{home.heroNote}</p>
                </div>
              </div>
              <div className={styles.heroVisual}>
                <div className={styles.heroImage}>
                  <Image
                    src='/images/luvlae-berberine-woman-with-patches.webp'
                    alt='Woman holding a Luvlae Berberine Patches box, with a patch on her upper arm'
                    width={1280}
                    height={853}
                    sizes='(max-width: 800px) calc(100vw - 40px), min(55vw, 720px)'
                    priority
                  />
                </div>
                <div className={styles.heroImageBadges}>
                  <span>{home.badgeOne}</span>
                  <span>{home.badgeTwo}</span>
                  <span>{home.badgeThree}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.benefitsSection} id='why-patches'>
          <div className={styles.container}>
            <Reveal>
              <SectionHeading
                eyebrow={home.benefits.eyebrow}
                title={home.benefits.title}
                description={home.benefits.description}
              />
            </Reveal>
            <div className={styles.fourCards}>
              {benefits.map(item => (
                <Reveal key={item.title}>
                  <InfoCard {...item}/>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.productSection}>
          <div className={styles.container}>
            <div className={styles.splitLayout}>
              <Reveal className={styles.productImage}>
                <Image
                  src='/images/luvlae-berberine-patches-open-box-and-patch-sheets.webp'
                  alt='Illustrative open Luvlae Berberine Patches box showing individual patches and inserts'
                  width={512}
                  height={279}
                />
                <div className={styles.productMetrics}>
                  <span><strong>60</strong>{home.product.metricOne}</span>
                  <span><strong>01</strong>{home.product.metricTwo}</span>
                  <span><strong>✓</strong>{home.product.metricThree}</span>
                </div>
              </Reveal>
              <Reveal className={styles.productCopy}>
                <p className={styles.eyebrow}>{home.product.eyebrow}</p>
                <h2><LineBreakText text={home.product.title}/></h2>
                <p>{home.product.description}</p>
                <ul className={styles.featureList}>
                  <li><span aria-hidden='true'>✓</span>{home.product.pointOne}</li>
                  <li><span aria-hidden='true'>✓</span>{home.product.pointTwo}</li>
                  <li><span aria-hidden='true'>✓</span>{home.product.pointThree}</li>
                </ul>
                <ActionLink href='/products/berberine-patches' variant='text'>{home.product.link}</ActionLink>
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.resourcesSection}>
          <div className={styles.container}>
            <Reveal>
              <SectionHeading
                eyebrow={home.resources.eyebrow}
                title={home.resources.title}
                description={home.resources.description}
                centered
              />
            </Reveal>
            <div className={styles.resourceGrid}>
              {resources.map(item => (
                <Reveal key={item.title}>
                  <InfoCard {...item} linkLabel={home.resources.link}/>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.lifestyleSection}>
          <div className={styles.container}>
            <div className={styles.splitLayout}>
              <Reveal className={styles.lifestyleImage}>
                <Image
                  src='/images/luvlae-berberine-patches-everyday-use-scenes.webp'
                  alt='Illustrations of people wearing a patch at work, at home, during exercise, and while resting'
                  width={512}
                  height={512}
                />
              </Reveal>
              <Reveal className={styles.lifestyleCopy}>
                <p className={styles.eyebrow}>{home.lifestyle.eyebrow}</p>
                <h2><LineBreakText text={home.lifestyle.title}/></h2>
                <p>{home.lifestyle.description}</p>
                <div className={styles.lifestyleHighlights}>
                  <div><strong>{home.lifestyle.highlightOneTitle}</strong><span>{home.lifestyle.highlightOneBody}</span></div>
                  <div><strong>{home.lifestyle.highlightTwoTitle}</strong><span>{home.lifestyle.highlightTwoBody}</span></div>
                </div>
                <p className={styles.imageNote}>{home.lifestyle.note}</p>
                <ActionLink href='/how-to-use-berberine-patches' variant='text'>{home.lifestyle.link}</ActionLink>
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.trustSection}>
          <div className={styles.container}>
            <Reveal>
              <SectionHeading
                eyebrow={home.trust.eyebrow}
                title={home.trust.title}
                description={home.trust.description}
              />
            </Reveal>
            <div className={styles.trustGrid}>
              <Reveal className={styles.trustStatement}>
                <span className={styles.statementMark}>“</span>
                <h3>{home.trust.statementTitle}</h3>
                <p>{home.trust.statementBody}</p>
                <ActionLink href='/science/berberine-patches' variant='text'>{home.trust.statementLink}</ActionLink>
              </Reveal>
              <Reveal className={styles.trustList}>
                <div><span>01</span><div><h3>{home.trust.oneTitle}</h3><p>{home.trust.oneBody}</p></div></div>
                <div><span>02</span><div><h3>{home.trust.twoTitle}</h3><p>{home.trust.twoBody}</p></div></div>
                <div><span>03</span><div><h3>{home.trust.threeTitle}</h3><p>{home.trust.threeBody}</p></div></div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <Reveal className={styles.ctaBox}>
              <p className={styles.eyebrow}>{home.cta.eyebrow}</p>
              <h2>{home.cta.title}</h2>
              <p>{home.cta.description}</p>
              <div className={styles.ctaActions}>
                <ActionLink
                  href={product.amazonUrl}
                  external
                  variant='light'
                  analyticsEvent='amazon_outbound_click'
                  analyticsLocation='home_cta'
                >
                  {home.cta.amazonButton}
                </ActionLink>
                <ActionLink href='/products/berberine-patches' variant='outline'>{home.cta.productButton}</ActionLink>
              </div>
              <small>{home.cta.note}</small>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter dictionary={dictionary}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}/>
    </>
  );
};
