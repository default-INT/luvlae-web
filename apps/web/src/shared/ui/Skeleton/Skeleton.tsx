import styles from './styles.module.scss';

interface Props { label: string; rows?: number }

export const Skeleton = (props: Props) => {
  const { label, rows = 5 } = props;
  return <div className={styles.skeleton} role='status' aria-busy>
    <span className={styles.label}>{label}</span>
    {Array.from({ length: rows }, (_, index) => <span className={styles.line} key={index} aria-hidden/>)}
  </div>;
};
