import { ProductRating } from '@/entities/product';
import { Reveal } from '@/shared/ui/Reveal';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface Props {
  copy: Dictionary['home']['feedback'];
}

export const FeedbackOverview = (props: Props) => {
  const { copy } = props;

  const insights = [
    { ...copy.convenience, icon: 'M9 12l2 2 4-4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
    { ...copy.application, icon: 'M4 7h9m4 0h3M4 17h3m4 0h9 M13 4v6M7 14v6' },
  ];

  return (
    <>
      <Reveal className={styles.header}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h2 id='feedback-heading'>{copy.title}</h2>
        <p className={styles.description}>{copy.description}</p>
      </Reveal>
      <div className={styles.layout}>
        <ProductRating copy={copy} href='#reviews-heading'/>
        <div className={styles.insights}>
          {insights.map((insight, index) => (
            <Reveal className={styles.card} delay={index * 100} key={insight.title}>
              <h3>
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                  <path d={insight.icon} stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'/>
                </svg>
                {insight.title}
              </h3>
              <p>{insight.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
};
