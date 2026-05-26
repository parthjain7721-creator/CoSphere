import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css'; // This directive must be placed beneath module imports to evaluate correctly

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element structure. Ensure index.html contains <div id="root"></div>');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);