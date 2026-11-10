import { money } from '@/shared/lib/money';

import styles from './styles.module.scss';

import type { PurchaseOffer, ProductStorefront } from '@/entities/product';
import type { Dictionary } from '@/shared/config/i18n';

interface Props {
  offers: PurchaseOffer[]; selected: string; disabled: boolean;
  storefront?: ProductStorefront;
  onChange: (offerId: string) => void; copy: Dictionary['commerce'];
}

export const PackSelector = (props: Props) => {
  const { offers, selected, disabled, onChange, copy, storefront } = props;

  return (
    <fieldset className={styles.selector} disabled={disabled}>
      <legend>{copy.choosePack}</legend>
      {offers.map(offer => (
        <label className={`${styles.option} ${offer.offerId === storefront?.highlightedOfferId ? styles.highlighted : ''}`}
          key={offer.offerId}>
          <input type='radio' name='purchase-offer' value={offer.offerId} checked={selected === offer.offerId}
            disabled={offer.availableQuantity < 1} onChange={() => onChange(offer.offerId)}/>
          <span>{offer.unitsPerPack}-{copy.packWord} · {offer.unitsPerPack} {copy.boxes} · {offer.patchesPerPack} {copy.patches}
            {offer.offerId === storefront?.highlightedOfferId && <span className={styles.badge}>
              {storefront.highlightBadge === 'bestValue' ? copy.bestValue : copy.recommended}</span>}
            {offer.availableQuantity < 1 && <small>{copy.soldOut}</small>}</span>
          <strong>{money(offer.price.unitAmount)}</strong>
        </label>
      ))}
    </fieldset>
  );
};
