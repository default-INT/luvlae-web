import Link from 'next/link';

import { siteUrl } from '@/shared/config/site';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface Props {
  dictionary: Dictionary;
}

export const ProductFilmPage = (props: Props) => {
  const { dictionary } = props;
  const { video } = dictionary.home;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    '@id': siteUrl('/videos/berberine-patches#video'),
    name: video.label,
    description: video.description,
    thumbnailUrl: siteUrl('/video/product-video-poster.webp'),
    contentUrl: siteUrl('/video/product-video.mp4'),
    uploadDate: video.uploadDate,
    duration: 'PT37.717S',
    inLanguage: 'en',
    publisher: { '@type': 'Organization', name: 'Luvlae', url: siteUrl('/') },
    mainEntityOfPage: siteUrl('/videos/berberine-patches'),
  };

  return (
    <>
      <SiteHeader dictionary={dictionary}/>
      <main className={styles.main}>
        <h1>{video.label}</h1>
        <video
          className={styles.player}
          controls
          playsInline
          preload='metadata'
          poster='/video/product-video-poster.webp'
          width={1280}
          height={720}
          aria-label={video.label}
        >
          <source src='/video/product-video.webm' type='video/webm'/>
          <source src='/video/product-video.mp4' type='video/mp4'/>
          <a href='/video/product-video.mp4'>{video.fallback}</a>
        </video>
        <p>{video.description}</p>
        <Link href='/products/berberine-patches'>{dictionary.home.hero.button} ↗</Link>
      </main>
      <SiteFooter dictionary={dictionary}/>
      {video.uploadDate && (
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
        />
      )}
    </>
  );
};
