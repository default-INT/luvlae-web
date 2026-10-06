import Image from 'next/image';
import Link from 'next/link';

import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
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
                <h1 id='ingredients-title'>{page.title}</h1>
                <p className={styles.lead}>{page.lead}</p>
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
                <figcaption>
                  <span>{page.imageCaption}</span>
                  <a href={ingredientImage} target='_blank' rel='noopener noreferrer'>
                    {page.imageLink} <span aria-hidden='true'>↗</span>
                  </a>
                </figcaption>
              </figure>
            </section>
          </div>
        </div>

        <section className={styles.composition} aria-labelledby='ingredient-list-title'>
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>{page.listEyebrow}</p>
              <h2 id='ingredient-list-title'>{page.listTitle}</h2>
              <p>{page.listDescription}</p>
            </div>
            <div className={styles.tableFrame}>
              <table>
                <thead>
                  <tr>
                    <th scope='col'>{page.ingredientColumn}</th>
                    <th scope='col'>{page.amountColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map(ingredient => (
                    <tr key={ingredient.name}>
                      <th scope='row'>{ingredient.name}</th>
                      <td>{ingredient.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.sourceNote}>{page.sourceNote}</p>
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
