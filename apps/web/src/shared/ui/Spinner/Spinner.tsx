import styles from './styles.module.scss';

interface Props { label: string }

export const Spinner = (props: Props) => {
  const { label } = props;

  return <span className={styles.spinner} role='status'><span className={styles.label}>{label}</span></span>;
};
