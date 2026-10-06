import Image from 'next/image';
import Link from 'next/link';

import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { LineBreakText } from '@/shared/ui/LineBreakText';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

const ingredientImage = '/images/luvlae-ingredients-per-patch.webp';

export const IngredientsPage = async () => {
  const dictionary = await getDictionary(defaultLocale);
  const { ingredientsPage: page, informationUi } = dictionary;
  const ingredients = Object.values(page.ingredients);

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: informationUi.home, item: 'https://luvlae.com/' },
      { '@type': 'ListItem', position: 2, name: page.title, item: 'https://luvlae.com/ingredients' },
    ],
  };

  return (
    <>
      <SiteHeader dictionary={dictionary}/>
      <main className={styles.main}>
        <div className={styles.heroShell}>
          <div className={styles.container}>
            <nav className={styles.breadcrumb} aria-label={informationUi.breadcrumbLabel}>
              <Link href='/'>{informationUi.home}</Link>
              <span aria-hidden='true'>/</span>
              <span aria-current='page'>{page.title}</span>
            </nav>
            <section className={styles.hero} aria-labelledby='ingredients-title'>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>{page.eyebrow}</p>
                <h1 id='ingredients-title'><LineBreakText text={page.headline}/></h1>
                <p className={styles.lead}>{page.lead}</p>
                <p className={styles.lead}>{page.detail}</p>
                <a className={styles.exploreLink} href='#ingredient-profiles'>
                  {page.exploreLink}
                  <span aria-hidden='true'>↓</span>
                </a>
              </div>
              <figure className={styles.visual}>
                <div className={styles.imageFrame}>
                  <Image
                    src={ingredientImage}
                    alt={page.imageAlt}
                    width={2500}
                    height={2500}
                    sizes='(max-width: 900px) 100vw, 50vw'
                    priority
                  />
                </div>
              </figure>
            </section>
          </div>
        </div>

        <section className={styles.profiles} aria-labelledby='ingredient-profiles-title'>
          <div className={styles.container}>
            <div className={styles.sectionHeading} id='ingredient-profiles'>
              <h2 id='ingredient-profiles-title'>{page.profilesTitle}</h2>
              <p>{page.profilesDescription}</p>
            </div>
            <div className={styles.profileGrid}>
              {ingredients.map(ingredient => (
                <article key={ingredient.name}>
                  <h3>{ingredient.name}</h3>
                  <p>{ingredient.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.related} aria-labelledby='related-title'>
          <div className={styles.container}>
            <p className={styles.eyebrow}>{page.relatedEyebrow}</p>
            <h2 id='related-title'>{page.relatedTitle}</h2>
            <div className={styles.relatedGrid}>
              <Link href='/products/berberine-patches'>{page.productLink}<span aria-hidden='true'>↗</span></Link>
              <Link href='/berberine-patch-safety'>{page.safetyLink}<span aria-hidden='true'>↗</span></Link>
              <Link href='/science/berberine-patches'>{page.scienceLink}<span aria-hidden='true'>↗</span></Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter dictionary={dictionary}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}/>
    </>
  );
};
