import styles from './styles.module.scss';

interface Props {
  rating: number;
  label: string;
}

export const ReviewStars = ({ rating, label }: Props) => (
  <span className={styles.stars} role='img' aria-label={label}>
    {Array.from({ length: 5 }, (_, index) => (
      <span aria-hidden='true' className={index < rating ? styles.filled : styles.empty} key={index}>
        {index < rating ? '★' : '☆'}
      </span>
    ))}
  </span>
);
