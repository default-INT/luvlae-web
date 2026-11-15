'use client';

import Image from 'next/image';
import { useState } from 'react';

import { interpolate } from '@/shared/lib/i18n';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface Props {
  dictionary: Dictionary['productPage']['hero'];
}

export const ProductGallery = (props: Props) => {
  const { dictionary } = props;
  const [activeIndex, setActiveIndex] = useState(0);

  const images = Object.values(dictionary.galleryImages).map((alt, index) => ({
    src: `/images/luvlae-product-gallery-${index + 1}.webp`,
    alt,
    id: `product-image-${index + 1}`,
    height: [1378, 1500, 1500, 1500, 1493, 1500][index],
    imageClass: styles[`image${index + 1}`],
    optionClass: styles[`option${index + 1}`],
  }));

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
            checked={index === activeIndex}
            onChange={() => setActiveIndex(index)}
          />
        ))}
        <div className={styles.mainImage}>
          {images.map((item, index) => (
            <Image
              className={item.imageClass}
              src={item.src}
              alt={item.alt}
              width={1500}
              height={item.height}
              priority={index === 0}
              sizes='(max-width: 800px) 100vw, 56vw'
              key={item.id}
            />
          ))}
          <button
            className={`${styles.galleryArrow} ${styles.previous}`}
            type='button'
            aria-label={dictionary.galleryPrevious}
            onClick={() => setActiveIndex(index => (index - 1 + images.length) % images.length)}
          >
            <span aria-hidden='true'>‹</span>
          </button>
          <button
            className={`${styles.galleryArrow} ${styles.next}`}
            type='button'
            aria-label={dictionary.galleryNext}
            onClick={() => setActiveIndex(index => (index + 1) % images.length)}
          >
            <span aria-hidden='true'>›</span>
          </button>
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
