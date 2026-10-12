import Image from 'next/image';
import Link from 'next/link';

import { product } from '@/entities/product';
import { ActionLink } from '@/shared/ui/ActionLink';
import { LineBreakText } from '@/shared/ui/LineBreakText';
import { Reveal } from '@/shared/ui/Reveal';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import { MoreReviews } from '../MoreReviews';
import { ReviewRow } from '../ReviewRow';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

const websiteSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://luvlae.com/#organization',
      name: 'Luvlae',
      url: 'https://luvlae.com/',
    },
    {
      '@type': 'WebSite',
      name: 'Luvlae',
      url: 'https://luvlae.com/',
      publisher: { '@id': 'https://luvlae.com/#organization' },
    },
  ],
};

export interface HomePageProps {
  dictionary: Dictionary;
}

export const HomePage = (props: HomePageProps) => {
  const { dictionary } = props;
  const { home } = dictionary;
  const reviews = Object.values(home.reviews.items);

  const stories = [
    { ...home.stories.one, image: 'luvlae-routine-1.webp', height: 960 },
    { ...home.stories.two, image: 'luvlae-routine-2.webp', height: 960 },
    { ...home.stories.three, image: 'luvlae-routine-3.webp', height: 1280 },
    { ...home.stories.four, image: 'luvlae-routine-4.webp', height: 960 },
  ];

  const guides = [
    { label: home.guides.about, href: '/about-product' },
    { label: home.guides.ingredients, href: '/ingredients' },
    { label: home.guides.howTo, href: '/how-to-use-berberine-patches' },
    { label: home.guides.safety, href: '/berberine-patch-safety' },
    { label: home.guides.science, href: '/science/berberine-patches' },
  ];

  return (
    <>
      <SiteHeader dictionary={dictionary}/>
      <main>
        <section className={styles.promo} aria-labelledby='promo-heading'>
          <div className={styles.promoInner}>
            <div className={styles.promoImage}>
              <Image
                src='/images/luvlae-promo-woman-patches-extended.png'
                alt={home.promo.imageAlt}
                width={1774}
                height={887}
                sizes='(max-width: 800px) 1100px, 1400px'
                priority
              />
            </div>
            <div className={styles.promoCopy}>
              <p className={styles.promoEyebrow}>{home.promo.eyebrow}</p>
              <h1 id='promo-heading' aria-label={`${home.promo.titleLineOne} ${home.promo.titleLineTwo}`}>
                <span className={styles.promoLine}>{home.promo.titleLineOne}</span>
                <span className={styles.promoLine}>{home.promo.titleLineTwo}</span>
              </h1>
              <p className={styles.promoDescription}>{home.promo.description}</p>
              <ActionLink
                href={product.amazonUrl}
                external
                variant='outline'
                className={styles.promoButton}
                analyticsEvent='amazon_outbound_click'
                analyticsLocation='home_promo'
              >
                {home.promo.button}
              </ActionLink>
              <p className={styles.promoNote}>{home.promo.note}</p>
            </div>
          </div>
        </section>
        <section className={styles.hero}>
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroVisual}>
              <div className={styles.offerBadge}>{home.hero.badge}</div>
              <Image
                src='/images/luvlae-berberine-patches-front-box-and-patch-sheet.webp'
                alt={home.hero.imageAlt}
                width={2500}
                height={2500}
                sizes='(max-width: 800px) calc(100vw - 40px), (max-width: 1440px) 46vw, 630px'
              />
            </div>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>{home.hero.eyebrow}</p>
              <h2><LineBreakText text={home.hero.title}/></h2>
              <p className={styles.description}>{home.hero.description}</p>
              <ul className={styles.features}>
                {[home.hero.featureOne, home.hero.featureTwo, home.hero.featureThree].map(feature => (
                  <li key={feature}><span aria-hidden='true'>✓</span>{feature}</li>
                ))}
              </ul>
              <div className={styles.heroActions}>
                <ActionLink
                  href={product.amazonUrl}
                  external
                  className={styles.cartButton}
                  analyticsEvent='amazon_outbound_click'
                  analyticsLocation='home_hero'
                >
                  {home.hero.button}
                </ActionLink>
                <ActionLink href='/about-product' variant='text'>{home.hero.details}</ActionLink>
              </div>
              <p className={styles.destination}>{home.hero.destination}</p>
              <p className={styles.offerNote}>{home.hero.offerNote}</p>
            </div>
          </div>
        </section>

        <section className={styles.storiesSection} aria-labelledby='stories-heading'>
          <div className={styles.container}>
            <Reveal className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>{home.stories.eyebrow}</p>
                <h2 id='stories-heading'>{home.stories.title}</h2>
              </div>
              <p>{home.stories.description}</p>
            </Reveal>
            <div className={styles.storiesGrid}>
              {stories.map((story, index) => (
                <Reveal className={styles.storyReveal} delay={index * 90} key={story.image}>
                  <figure className={styles.story}>
                    <Image
                      src={`/images/main/${story.image}`}
                      alt={story.imageAlt}
                      width={720}
                      height={story.height}
                      sizes='(max-width: 640px) 80vw, (max-width: 1040px) 45vw, 24vw'
                    />
                    <figcaption>
                      <span className={styles.quoteMark} aria-hidden='true'>“</span>
                      <blockquote>{story.quote}</blockquote>
                      <span className={styles.storyLabel}>{story.label}</span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
            <Reveal delay={120}><p className={styles.photoNote}>{home.stories.note}</p></Reveal>
          </div>
        </section>

        <section className={styles.featuredSection} aria-labelledby='featured-heading'>
          <div className={styles.container}>
            <Reveal className={styles.centeredHeading}>
              <p className={styles.eyebrow}>{home.featured.eyebrow}</p>
              <h2 id='featured-heading'>{home.featured.title}</h2>
              <p>{home.featured.description}</p>
            </Reveal>
            <div className={styles.featuredGrid}>
              {reviews.slice(0, 3).map((review, index) => (
                <Reveal className={styles.reviewCardReveal} delay={index * 100} key={review.title}>
                  <article className={styles.reviewCard}>
                    <span className={styles.cardQuote} aria-hidden='true'>“</span>
                    <h3>{review.title}</h3>
                    <blockquote>{review.body}</blockquote>
                    <span className={styles.reviewTopic}>{review.topic}</span>
                  </article>
                </Reveal>
              ))}
            </div>
            <Reveal className={styles.reviewLink}>
              <ActionLink href='#reviews' variant='text'>{home.featured.link}</ActionLink>
            </Reveal>
          </div>
        </section>

        <section className={styles.ctaSection} aria-labelledby='cta-heading'>
          <div className={styles.container}>
            <Reveal className={styles.ctaBox}>
              <div className={styles.ctaImage}>
                <Image
                  src='/images/luvlae-berberine-patches-front-box-and-patch-sheet.webp'
                  alt={home.hero.imageAlt}
                  width={2500}
                  height={2500}
                  sizes='(max-width: 640px) 200px, 340px'
                />
              </div>
              <div className={styles.ctaCopy}>
                <p className={styles.eyebrow}>{home.cta.eyebrow}</p>
                <h2 id='cta-heading'><LineBreakText text={home.cta.title}/></h2>
                <p>{home.cta.description}</p>
                <div className={styles.ctaActions}>
                  <ActionLink
                    href={product.amazonUrl}
                    external
                    variant='light'
                    className={styles.cartButton}
                    analyticsEvent='amazon_outbound_click'
                    analyticsLocation='home_cta'
                  >
                    {home.cta.button}
                  </ActionLink>
                  <Link href='/products/berberine-patches'>{home.cta.details} <span aria-hidden='true'>↗</span></Link>
                </div>
                <small>{home.cta.note}</small>
              </div>
            </Reveal>
          </div>
        </section>

        <section className={styles.reviewsSection} id='reviews' aria-labelledby='reviews-heading'>
          <div className={styles.reviewContainer}>
            <Reveal className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>{home.reviews.eyebrow}</p>
                <h2 id='reviews-heading'>{home.reviews.title}</h2>
              </div>
              <p>{home.reviews.description}</p>
            </Reveal>
            <p className={styles.reviewDisclosure}>{home.reviews.disclosure}</p>
            {reviews.slice(0, 5).map((review, index) => (
              <Reveal key={review.title}>
                <ReviewRow {...review} number={index + 1} label={home.reviews.label} ratingLabel={home.reviews.ratingLabel}/>
              </Reveal>
            ))}
            <MoreReviews showLabel={home.reviews.more} hideLabel={home.reviews.less}>
              {reviews.slice(5).map((review, index) => (
                <Reveal key={review.title}>
                  <ReviewRow {...review} number={index + 6} label={home.reviews.label} ratingLabel={home.reviews.ratingLabel}/>
                </Reveal>
              ))}
            </MoreReviews>
            <Reveal><p className={styles.reviewNote}>{home.reviews.note}</p></Reveal>
          </div>
        </section>

        <aside className={styles.guides} aria-label={home.guides.title}>
          <Reveal className={styles.container}>
            <p>{home.guides.title}</p>
            <div>{guides.map(guide => <Link key={guide.href} href={guide.href}>{guide.label} ↗</Link>)}</div>
          </Reveal>
        </aside>
      </main>
      <SiteFooter dictionary={dictionary}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}/>
    </>
  );
};
