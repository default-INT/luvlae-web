import Image from 'next/image';

import { ActionLink } from '@/shared/ui/ActionLink';

import styles from './styles.module.scss';

interface Props {
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  iconWidth: number;
  iconHeight: number;
  href?: string;
  linkLabel?: string;
}

export const InfoCard = (props: Props) => {
  const { eyebrow, title, description, icon, iconWidth, iconHeight, href, linkLabel } = props;

  return (
    <article className={styles.card}>
      <div className={styles.icon}>
        <Image src={icon} alt='' width={iconWidth} height={iconHeight} aria-hidden='true'/>
      </div>
      <div className={styles.body}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {href && linkLabel && <ActionLink href={href} variant='text'>{linkLabel}</ActionLink>}
    </article>
  );
};
