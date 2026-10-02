import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

export interface HomePageProps {
  dictionary: Dictionary;
}

export function HomePage(props: HomePageProps) {
  const { dictionary } = props;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>{dictionary.home.eyebrow}</p>
        <h1>{dictionary.home.title}</h1>
        <p className={styles.description}>{dictionary.home.description}</p>
      </div>
    </main>
  );
}
