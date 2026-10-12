import styles from './styles.module.scss';

interface Props {
  eyebrow: string;
  title: string;
  description?: string;
  centered?: boolean;
}

export const SectionHeading = (props: Props) => {
  const { eyebrow, title, description, centered = false } = props;

  return (
    <div className={`${styles.heading} ${centered ? styles.centered : ''}`}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
};
