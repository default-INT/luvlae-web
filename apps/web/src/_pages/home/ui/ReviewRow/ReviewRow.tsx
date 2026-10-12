import { ReviewStars } from '../ReviewStars';

import styles from './styles.module.scss';

interface Props {
  title: string;
  topic: string;
  body: string;
  number: number;
  label: string;
  displayName: string;
  rating: string;
  ratingLabel: string;
}

export const ReviewRow = (props: Props) => {
  const { title, topic, body, number, label, displayName, rating, ratingLabel } = props;

  return (
    <article className={styles.row}>
      <div className={styles.context}>
        <span className={styles.number}>{label} {String(number).padStart(2, '0')}</span>
        <strong className={styles.name}>{displayName}</strong>
        <ReviewStars rating={Number(rating)} label={ratingLabel.replace('{{rating}}', rating)}/>
        <span className={styles.topic}>{topic}</span>
      </div>
      <div className={styles.content}>
        <h3>{title}</h3>
        <blockquote>{body}</blockquote>
      </div>
      <span className={styles.mark} aria-hidden='true'>“</span>
    </article>
  );
};
