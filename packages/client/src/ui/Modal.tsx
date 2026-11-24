import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Seletor dos elementos que recebem foco por Tab, usado para prender o foco no diálogo. */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Diálogo modal acessível: fecha com Esc ou clique fora e mantém o foco dentro enquanto aberto. */
export function Modal({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDivElement>(null);
  // `onClose` em ref: o efeito do teclado roda uma vez só e ainda chama a versão mais recente.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Foco entra no diálogo, Tab fica preso dentro dele e, ao fechar, volta para onde estava.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogElement = dialog.current;
    const focusables = () => [...(dialogElement?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      .filter((element) => !element.closest('[inert]'));
    (focusables()[0] ?? dialogElement)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      // Tab no último volta ao primeiro, Shift+Tab no primeiro vai ao último.
      const focusableElements = focusables();
      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  // Portal: um ancestral com transform (a barra da mesa) prenderia o position: fixed.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialog}
        className={className ? 'modal ' + className : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Clique dentro do diálogo não chega ao fundo, que fecha o modal.
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
