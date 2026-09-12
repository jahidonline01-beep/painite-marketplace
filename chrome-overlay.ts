type Listener = (open: boolean) => void;

let open = false;
const listeners = new Set<Listener>();

export function setChromeOverlay(next: boolean) {
  open = next;
  listeners.forEach((fn) => fn(open));
}

export function subscribeChromeOverlay(fn: Listener) {
  listeners.add(fn);
  fn(open);
  return () => {
    listeners.delete(fn);
  };
}
