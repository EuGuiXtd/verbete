import { createRoot } from 'react-dom/client';
import '../index.css';
import Showcase from './Showcase';

/*
 * Entry for showcase.html only. Named `mount.tsx` rather than `showcase.tsx`
 * because macOS filesystems are case-insensitive by default and a sibling
 * `showcase.tsx` would BE `Showcase.tsx` — the two files silently become one.
 *
 * Vite's production build takes index.html as its single input, so nothing
 * reachable from here ships.
 */
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found.');
}

createRoot(rootElement).render(<Showcase />);
