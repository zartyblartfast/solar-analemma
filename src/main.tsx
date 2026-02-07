import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

 (globalThis as any).__ANAL_EMMA_DEBUG__ = true;

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
