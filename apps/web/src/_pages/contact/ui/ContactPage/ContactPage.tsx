import Link from 'next/link';

import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

export const ContactPage = async () => {
  const dictionary = await getDictionary(defaultLocale);
  const { contactPage: copy, informationUi } = dictionary;
  const emailHref = `mailto:${copy.email}`;

  const policies = [
    { label: copy.shippingPolicy, href: '/shipping' },
    { label: copy.returnsPolicy, href: '/returns' },
    { label: copy.privacyPolicy, href: '/privacy' },
    { label: copy.terms, href: '/terms' },
  ];

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: informationUi.home, item: 'https://luvlae.com/' },
      { '@type': 'ListItem', position: 2, name: copy.title, item: 'https://luvlae.com/contact' },
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
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.lead}</p>
          </header>
          <div className={styles.body}>
            <div className={styles.article}>
              <section className={styles.support} aria-labelledby='customer-support'>
                <h2 id='customer-support'>{copy.supportTitle}</h2>
                <dl className={styles.details}>
                  <div><dt>{copy.emailLabel}</dt><dd><a className={styles.email} href={emailHref}>{copy.email}</a></dd></div>
                  <div><dt>{copy.responseLabel}</dt><dd>{copy.responseTime}</dd></div>
                </dl>
                <p>{copy.orderHelp}</p>
              </section>
              <section aria-labelledby='business-information'>
                <h2 id='business-information'>{copy.businessTitle}</h2>
                <p>{copy.operatedBy} <strong>{copy.businessName}</strong>.</p>
                <dl className={styles.details}>
                  <div><dt>{copy.legalNameLabel}</dt><dd>{copy.businessName}</dd></div>
                  <div>
                    <dt>{copy.addressLabel}</dt>
                    <dd><address>{copy.address}</address></dd>
                  </div>
                  <div><dt>{copy.websiteLabel}</dt><dd><a href={copy.website}>{copy.website}</a></dd></div>
                </dl>
              </section>
              <section aria-labelledby='returns-refunds'>
                <h2 id='returns-refunds'>{copy.returnsTitle}</h2>
                <p>
                  {copy.returnsIntro} <a href={emailHref}>{copy.email}</a>. {copy.returnsPolicyIntro}{' '}
                  <Link href='/returns'>
                    {copy.returnsPolicy}
                  </Link>{' '}
                  {copy.returnsPolicyEnd}
                </p>
                <p className={styles.notice}>{copy.returnAddressNotice}</p>
              </section>
            </div>
            <aside className={styles.sidebar} aria-labelledby='helpful-links'>
              <h2 id='helpful-links'>{copy.helpfulTitle}</h2>
              <ul>
                {policies.map(policy => (
                  <li key={policy.label}>
                    {policy.href ? <Link href={policy.href}>{policy.label}</Link> : (
                      <span aria-disabled='true'>{policy.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter dictionary={dictionary}/>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}/>
    </>
  );
};
