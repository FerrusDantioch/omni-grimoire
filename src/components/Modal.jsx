import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Feuille modale : plein largeur en bas sur mobile, boite centree au dela.
 * Ferme sur Echap et sur clic hors du panneau, piege le focus a l'interieur.
 */
export default function Modal({ open, onClose, title, children, footer, labelledBy }) {
  const autoTitleId = useId();
  const titleId = labelledBy || autoTitleId;
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      if (!panelRef.current) return;
      // Preserver le focus si un champ enfant (ex. autoFocus) l'a deja recu.
      if (panelRef.current.contains(document.activeElement)) return;
      const target = panelRef.current.querySelector(FOCUSABLE);
      target?.focus();
    }, 40);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = overflow;
      if (restoreRef.current?.isConnected) {
        restoreRef.current.focus();
      }
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="modal__head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/** Confirmation simple, utilisee avant toute suppression. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmer', danger = true, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--txt-2)', margin: 0 }}>{message}</p>
    </Modal>
  );
}
