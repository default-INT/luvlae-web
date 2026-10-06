import Image from 'next/image';
import Link from 'next/link';

import { product } from '@/entities/product';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { ActionLink } from '@/shared/ui/ActionLink';
import { Reveal } from '@/shared/ui/Reveal';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import { ProductFaq } from '../ProductFaq';
import { ProductGallery } from '../ProductGallery';

import styles from './styles.module.scss';

export const ProductPage = async () => {
  const dictionary = await getDictionary(defaultLocale);
  const { productPage: page } = dictionary;

  const facts = [
    { title: page.verification.countTitle, body: page.verification.countBody, mark: String(product.count) },
    { title: page.verification.formatTitle, body: page.verification.formatBody, mark: '↗' },
    { title: page.verification.labelTitle, body: page.verification.labelBody, mark: '✓' },
  ];

  const steps = [
    { number: page.routine.stepOneNumber, title: page.routine.stepOneTitle, body: page.routine.stepOneBody },
    { number: page.routine.stepTwoNumber, title: page.routine.stepTwoTitle, body: page.routine.stepTwoBody },
    { number: page.routine.stepThreeNumber, title: page.routine.stepThreeTitle, body: page.routine.stepThreeBody },
    { number: page.routine.stepFourNumber, title: page.routine.stepFourTitle, body: page.routine.stepFourBody },
  ];

  const resources = [
    {
      title: page.resources.ingredientsTitle,
      body: page.resources.ingredientsBody,
      icon: '/images/icons/ingredients-guide-icon.svg',
      href: '/ingredients',
    },
    {
      title: page.resources.howToTitle,
      body: page.resources.howToBody,
      icon: '/images/icons/patch-use-guide-icon.svg',
      href: '/how-to-use-berberine-patches',
    },
    {
      title: page.resources.safetyTitle,
      body: page.resources.safetyBody,
      icon: '/images/icons/patch-safety-guide-icon.svg',
      href: '/berberine-patch-safety',
    },
    {
      title: page.resources.scienceTitle,
      body: page.resources.scienceBody,
      icon: '/images/icons/berberine-research-guide-icon.svg',
      href: '/science/berberine-patches',
    },
  ];

  const questions = Object.values(page.faq.items);

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: page.home, item: 'https://luvlae.com/' },
      { '@type': 'ListItem', position: 2, name: page.breadcrumbCurrent, item: 'https://luvlae.com/products/berberine-patches' },
    ],
  };

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: page.hero.title,
    description: page.schemaDescription,
    brand: { '@type': 'Brand', name: page.schemaBrand },
    image: 'https://luvlae.com/images/luvlae-berberine-patches-box-and-patch-sheet.webp',
    size: page.hero.detailTwoValue,
    url: 'https://luvlae.com/products/berberine-patches',
  };

  return (
    <>
      <SiteHeader dictionary={dictionary}/>
      <main className={styles.main}>
        <div className={styles.container}>
          <nav className={styles.breadcrumb} aria-label={page.breadcrumbLabel}>
            <Link href='/'>{page.home}</Link>
            <span aria-hidden='true'>/</span>
            <span aria-current='page'>{page.breadcrumbCurrent}</span>
          </nav>
          <section className={styles.hero} aria-labelledby='product-title'>
            <ProductGallery dictionary={page.hero}/>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>{page.hero.eyebrow}</p>
              <h1 id='product-title'>{page.hero.title}</h1>
              <p className={styles.subtitle}>{page.hero.subtitle}</p>
              <p className={styles.description}>{page.hero.description}</p>
              <dl className={styles.details}>
                <div><dt>{page.hero.detailOneLabel}</dt><dd>{page.hero.detailOneValue}</dd></div>
                <div><dt>{page.hero.detailTwoLabel}</dt><dd>{page.hero.detailTwoValue}</dd></div>
                <div><dt>{page.hero.detailThreeLabel}</dt><dd>{page.hero.detailThreeValue}</dd></div>
                <div><dt>{page.hero.detailFourLabel}</dt><dd>{page.hero.detailFourValue}</dd></div>
              </dl>
              <ActionLink
                href={product.amazonUrl}
                external
                className={styles.buyButton}
                analyticsEvent='amazon_outbound_click'
                analyticsLocation='product_hero'
              >
                {page.hero.primaryAction}
              </ActionLink>
              <p className={styles.purchaseNote}>{page.hero.purchaseNote}</p>
              <Link className={styles.inlineLink} href='#product-details'>{page.hero.secondaryAction} ↗</Link>
            </div>
          </section>
        </div>

        <section className={styles.verification} id='product-details' aria-labelledby='verification-title'>
          <div className={styles.container}>
            <Reveal className={styles.sectionIntro}>
              <p className={styles.eyebrow}>{page.verification.eyebrow}</p>
              <h2 id='verification-title'>{page.verification.title}</h2>
              <p>{page.verification.description}</p>
            </Reveal>
            <Reveal className={styles.factGrid}>
              {facts.map(fact => (
                <article className={styles.factCard} key={fact.title}>
                  <span className={styles.factMark} aria-hidden='true'>{fact.mark}</span>
                  <h3>{fact.title}</h3><p>{fact.body}</p>
                </article>
              ))}
            </Reveal>
            <p className={styles.sourceNote}>{page.verification.source}</p>
          </div>
        </section>

        <section className={styles.routine} aria-labelledby='routine-title'>
          <div className={styles.container}>
            <Reveal className={styles.routineTop}>
              <div className={styles.sectionIntro}>
                <p className={styles.eyebrow}>{page.routine.eyebrow}</p>
                <h2 id='routine-title'>{page.routine.title}</h2>
                <p>{page.routine.description}</p>
              </div>
              <ActionLink href='/how-to-use-berberine-patches' variant='text'>{page.routine.link}</ActionLink>
            </Reveal>
            <Reveal className={styles.stepGrid}>
              {steps.map(step => (
                <article className={styles.stepCard} key={step.number}>
                  <span aria-hidden='true'>{step.number}</span><h3>{step.title}</h3><p>{step.body}</p>
                </article>
              ))}
            </Reveal>
            <Reveal>
              <figure className={styles.routineImage}>
                <Image
                  src='/images/luvlae-berberine-patches-everyday-use-scenes.webp'
                  alt={page.routine.imageAlt}
                  width={512}
                  height={512}
                  sizes='(max-width: 800px) 100vw, 44vw'
                />
                <figcaption>{page.routine.imageNote}</figcaption>
              </figure>
            </Reveal>
          </div>
        </section>

        <section className={styles.resources} aria-labelledby='resources-title'>
          <div className={styles.container}>
            <Reveal className={styles.sectionIntro}>
              <p className={styles.eyebrow}>{page.resources.eyebrow}</p>
              <h2 id='resources-title'>{page.resources.title}</h2>
              <p>{page.resources.description}</p>
            </Reveal>
            <Reveal className={styles.resourceGrid}>
              {resources.map(resource => (
                <article className={styles.resourceCard} key={resource.href}>
                  <div className={styles.resourceIcon}><Image src={resource.icon} alt='' width={24} height={24}/></div>
                  <h3>{resource.title}</h3><p>{resource.body}</p>
                  <Link href={resource.href}>{page.resources.link} <span aria-hidden='true'>↗</span></Link>
                </article>
              ))}
            </Reveal>
          </div>
        </section>

        <section className={styles.evidence} aria-labelledby='evidence-title'>
          <div className={styles.container}>
            <Reveal className={styles.evidenceGrid}>
              <div>
                <p className={styles.eyebrow}>{page.evidence.eyebrow}</p>
                <h2 id='evidence-title'>{page.evidence.title}</h2>
                <p>{page.evidence.description}</p>
                <ActionLink href='/science/berberine-patches' variant='text'>{page.evidence.link}</ActionLink>
              </div>
              <aside className={styles.evidenceNote}>
                <span className={styles.noteIcon} aria-hidden='true'>i</span>
                <h3>{page.evidence.noteTitle}</h3><p>{page.evidence.noteBody}</p>
              </aside>
            </Reveal>
          </div>
        </section>

        <section className={styles.faq} aria-labelledby='faq-title'>
          <div className={styles.container}>
            <Reveal className={styles.sectionIntro}>
              <p className={styles.eyebrow}>{page.faq.eyebrow}</p>
              <h2 id='faq-title'>{page.faq.title}</h2>
              <p>{page.faq.description}</p>
            </Reveal>
            <ProductFaq questions={questions}/>
            <Link className={styles.inlineLink} href='/faq'>{page.faq.moreLink} ↗</Link>
          </div>
        </section>

        <section className={styles.cta} aria-labelledby='cta-title'>
          <div className={styles.container}>
            <Reveal className={styles.ctaBox}>
              <div>
                <p className={styles.eyebrow}>{page.cta.eyebrow}</p>
                <h2 id='cta-title'>{page.cta.title}</h2>
                <p>{page.cta.description}</p>
                <small>{page.cta.note}</small>
              </div>
              <ActionLink
                href={product.amazonUrl}
                external
                variant='light'
                analyticsEvent='amazon_outbound_click'
                analyticsLocation='product_cta'
              >
                {page.cta.button}
              </ActionLink>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter dictionary={dictionary}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}/>
    </>
  );
};
