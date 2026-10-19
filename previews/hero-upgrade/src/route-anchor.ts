/**
 * Fragment adapter for the existing path router and PageTransition contract.
 * PageTransition.run already resolves true only after entrance completion;
 * this module consumes that result and delegates scrolling to existing Lenis.
 * It owns no listeners, history, animation clock, or keyboard focus.
 */
type Completion = boolean | PromiseLike<boolean>;

export function mountRouteAnchor(root: HTMLElement, options: { scrollTo(target: HTMLElement): void }) {
  let sequence = 0, disposed = false;

  return {
    /** Prepare at the start of every navigation, including those without a hash. */
    prepare(hash: string) {
      const current = ++sequence;
      let id: string | null = null, consumed = false;
      if (hash.startsWith('#') && hash.length > 1) {
        try { id = decodeURIComponent(hash.slice(1)); } catch { /* Malformed fragments keep normal route behaviour. */ }
      }
      /** Pass swapView's result; no transition is equivalent to completed=true. */
      return async (completion: Completion): Promise<boolean> => {
        const completed = await completion;
        if (!completed || disposed || current !== sequence || consumed || !id) return false;
        consumed = true;
        // Resolve only after the new page exists; IDs are literal, never selectors.
        const target = root.ownerDocument.getElementById(id);
        if (!target || !target.isConnected || !root.contains(target)
          || target.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
        options.scrollTo(target);
        return true;
      };
    },
    dispose() { if (disposed) return; disposed = true; sequence++; },
  };
}
