import { useEffect, useId, useRef, useState } from 'react';

import { money } from '@/shared/lib/money';

import styles from './styles.module.scss';

import type { PurchaseOffer } from '@/entities/product';
import type { Dictionary } from '@/shared/config/i18n';

interface Props {
  offers: PurchaseOffer[]; value: string; disabled: boolean; copy: Dictionary['commerce'];
  onChange: (offerId: string) => Promise<void>;
}

export const CartPackSelect = (props: Props) => {
  const { offers, value, disabled, copy, onChange } = props;
  const [expanded, setExpanded] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const choosing = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = expanded && !disabled;
  const selected = offers.find(offer => offer.offerId === value);

  useEffect(() => {
    if (!open) return;

    const option = list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)')
      ?? list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');

    option?.focus({ preventScroll: true });

    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setExpanded(false);
    };

    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div className={styles.select} ref={root} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
    }} onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        event.stopPropagation();
        setExpanded(false);
        trigger.current?.focus();
      }
    }}>
      <span id={`${id}-label`} className={styles.label}>{copy.choosePack}</span>
      <button ref={trigger} type='button' className={styles.trigger} disabled={disabled || selecting}
        aria-labelledby={`${id}-label ${id}-value`} aria-haspopup='listbox' aria-expanded={open}
        aria-controls={`${id}-list`} onClick={() => setExpanded(!open)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setExpanded(true);
          }
        }}>
        <span id={`${id}-value`}>{selected ? `${selected.unitsPerPack} ${copy.boxes}` : copy.invalidPack}</span>
        {selected && <strong>{money(selected.price.unitAmount)}</strong>}
        <svg className={open ? styles.rotated : ''} width='16' height='16' viewBox='0 0 16 16'
          fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden='true'><path d='m4 6 4 4 4-4'/></svg>
      </button>
      <div ref={panel} className={`${styles.panel} ${open ? styles.open : ''}`} inert={!open}>
        <div className={styles.clip}>
          <div ref={list} id={`${id}-list`} role='listbox' aria-labelledby={`${id}-label`} className={styles.list}
            onKeyDown={event => {
              const options = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
              const index = options.indexOf(document.activeElement as HTMLButtonElement);
              let next = index;

              if (event.key === 'ArrowDown') next = (index + 1) % options.length;
              else if (event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = options.length - 1;
              else return;

              event.preventDefault();
              options[next]?.focus();
            }}>
            {offers.map(offer => (
              <button type='button' role='option' key={offer.offerId} aria-selected={offer.offerId === value}
                tabIndex={-1} disabled={offer.availableQuantity < 1} className={styles.option}
                onClick={async () => {
                  if (choosing.current) return;

                  choosing.current = true;
                  setSelecting(true);
                  setExpanded(false);
                  trigger.current?.focus();

                  try {
                    // Wait for React's close render before reading the CSS transitions.
                    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                    await Promise.allSettled((panel.current?.getAnimations() ?? []).map(animation => animation.finished));

                    if (offer.offerId !== value) await onChange(offer.offerId);
                  } finally { choosing.current = false; setSelecting(false); }
                }}>
                <span className={styles.check} aria-hidden='true'>{offer.offerId === value ? '✓' : ''}</span>
                <span>{offer.unitsPerPack} {copy.boxes}
                  <small>{offer.availableQuantity < 1 ? copy.soldOut : `${offer.patchesPerPack} ${copy.patches}`}</small></span>
                <strong>{money(offer.price.unitAmount)}</strong>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
