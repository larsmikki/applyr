import { useEffect } from 'react';

const BASE = 'Applyr';

/**
 * Set the browser tab title for the current page. Pass a falsy value to keep
 * the bare app title. Restores the previous title on unmount so navigating away
 * from a transient view (modal, detail) doesn't leak a stale title.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${BASE}` : BASE;
    return () => { document.title = previous; };
  }, [title]);
}
