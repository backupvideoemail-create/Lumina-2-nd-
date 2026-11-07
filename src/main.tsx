import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Ultra-Safe Service Worker Registration (browser only, non-blocking)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Non-blocking catch to prevent app failure
      console.warn('[PWA] Service Worker registration skipped:', err?.message || err);
    });
  });
}

