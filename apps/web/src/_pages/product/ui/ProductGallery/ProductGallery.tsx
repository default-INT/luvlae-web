import Image from 'next/image';

import { interpolate } from '@/shared/lib/i18n';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface Props {
  dictionary: Dictionary['productPage']['hero'];
}

export const ProductGallery = (props: Props) => {
  const { dictionary } = props;

  const images = [
    {
      src: '/images/luvlae-berberine-patches-front-box-and-patch-sheet.png',
      alt: dictionary.imageThreeAlt,
      id: 'product-image-1',
      imageClass: styles.imageOne,
      optionClass: styles.optionOne,
    },
    {
      src: '/images/luvlae-berberine-patches-open-box-and-patch-sheets.png',
      alt: dictionary.imageTwoAlt,
      id: 'product-image-2',
      imageClass: styles.imageTwo,
      optionClass: styles.optionTwo,
    },
    {
      src: '/images/luvlae-berberine-patches-box-and-patch-sheet.png',
      alt: dictionary.imageOneAlt,
      id: 'product-image-3',
      imageClass: styles.imageThree,
      optionClass: styles.optionThree,
    },
  ];

  return (
    <div className={styles.gallery} aria-label={dictionary.galleryLabel}>
      <div className={styles.galleryControl}>
        {images.map((item, index) => (
          <input
            className={`${styles.radio} ${item.optionClass}`}
            type='radio'
            name='product-image'
            id={item.id}
            key={item.id}
            aria-label={interpolate(dictionary.galleryImageLabel, { number: index + 1 })}
            defaultChecked={index === 0}
          />
        ))}
        <div className={styles.mainImage}>
          {images.map((item, index) => (
            <Image
              className={item.imageClass}
              src={item.src}
              alt={item.alt}
              width={2500}
              height={2500}
              priority={index === 0}
              sizes='(max-width: 800px) 100vw, 56vw'
              key={item.id}
            />
          ))}
        </div>
        <div className={styles.thumbnails}>
          {images.map((item, index) => (
            <label className={item.optionClass} htmlFor={item.id} key={item.id}>
              <Image src={item.src} alt='' width={120} height={120}/>
              <span className={styles.visuallyHidden}>{interpolate(dictionary.galleryImageLabel, { number: index + 1 })}</span>
            </label>
          ))}
        </div>
      </div>
      <p className={styles.note}>{dictionary.galleryNote}</p>
    </div>
  );
};
