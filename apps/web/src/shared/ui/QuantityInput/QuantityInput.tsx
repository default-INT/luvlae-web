'use client';

import { useId, useState } from 'react';

import styles from './styles.module.scss';

interface Props {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export const QuantityInput = (props: Props) => {
  const { label, decreaseLabel, increaseLabel, value, min = 1, max = 99, disabled, onChange } = props;
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const currentValue = draft === null || draft === '' ? value : Number(draft);

  const commit = () => {
    if (draft === null) return;

    const next = draft === '' ? value : Math.min(max, Math.max(min, Number(draft)));
    setDraft(null);

    if (next !== value) onChange(next);
  };

  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, currentValue + delta));
    setDraft(null);

    if (next !== value) onChange(next);
  };

  return (
    <div className={styles.quantity}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.control}>
        <button type='button' aria-label={decreaseLabel} aria-controls={id} disabled={disabled || currentValue <= min}
          onPointerDown={event => event.preventDefault()}
          onClick={() => step(-1)}>−</button>
        <input id={id} type='text' inputMode='numeric' pattern='[0-9]*' value={draft ?? value}
          disabled={disabled} role='spinbutton' aria-valuemin={min} aria-valuemax={max} aria-valuenow={currentValue}
          onChange={event => { if (/^\d{0,2}$/.test(event.target.value)) setDraft(event.target.value); }}
          onBlur={commit} onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();

            if (event.key === 'Escape') { event.preventDefault(); setDraft(null); }

            if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
              event.preventDefault();
              step(event.key === 'ArrowUp' ? 1 : -1);
            }
          }}/>
        <button type='button' aria-label={increaseLabel} aria-controls={id} disabled={disabled || currentValue >= max}
          onPointerDown={event => event.preventDefault()}
          onClick={() => step(1)}>+</button>
      </div>
    </div>
  );
};
