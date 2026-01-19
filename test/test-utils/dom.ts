import { JSDOM } from 'jsdom';

export function ensureDom (): void {
  // Ensure DOM exists for potential helpers elsewhere.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    (global as unknown as { window: Window }).window = dom.window as unknown as Window;
    (global as unknown as { document: Document }).document = dom.window.document;
  }
}
