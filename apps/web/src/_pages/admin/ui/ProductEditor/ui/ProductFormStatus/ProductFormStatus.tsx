import styles from '../../../styles.module.scss';

import type { AdminCopy } from '../../../../model/types';
import type { useProductForm } from '../../utils/useProductForm';

interface Props {
  form: ReturnType<typeof useProductForm>;
  currentVersion: number;
  copy: AdminCopy;
  busy: boolean;
}

export const ProductFormStatus = (props: Props) => {
  const { form, currentVersion, copy, busy } = props;

  return (
    <>
      <p className={styles.note}>
        {copy.catalogUi.editVersion}: {form.version} · {copy.catalogUi.currentVersion}: {currentVersion}
      </p>
      {form.version !== currentVersion && (
        <div className={styles.error} role='status'>
          <p>{copy.catalogUi.changedDraft}</p>
          <button type='button' className={styles.secondary} disabled={busy || form.locked}
            onClick={() => form.setVersion(currentVersion)}>{copy.catalogUi.reviewVersion}</button>
        </div>
      )}
      {(form.validation || form.mutation.error) && (
        <p role='alert' className={styles.error}>{form.validation || form.mutation.error}</p>
      )}
      {(form.mutation.uncertain || form.mutation.refreshFailed) && (
        <div className={styles.error} role='status'>
          <p>{form.mutation.uncertain ? copy.catalogUi.uncertainWrite : copy.catalogUi.acceptedRefreshFailed}</p>
          <button type='button' className={styles.secondary} disabled={busy} onClick={() => void form.retry()}>
            {form.mutation.uncertain ? copy.catalogUi.retryExactOperation : copy.refresh}
          </button>
        </div>
      )}
      {form.mutation.saved && <p role='status' className={styles.success}>{copy.saved}</p>}
    </>
  );
};
