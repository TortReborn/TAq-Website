import { CSSProperties } from 'react';
import styles from './inventory.module.css';

type IconName = 'cancel' | 'arrow-up' | 'arrow-down';

/** Monochrome Wynncraft button texture, masked so it takes the current text colour. */
export function WynnIcon({ name }: { name: IconName }) {
  return (
    <span
      className={styles.wynnIcon}
      style={{ '--wynn-icon': `url(/images/icons/wynn/${name}.png)` } as CSSProperties}
    />
  );
}

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className={styles.closeButton} onClick={onClick} aria-label={label}>
      <WynnIcon name="cancel" />
    </button>
  );
}
