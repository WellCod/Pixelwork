import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { App } from './App.tsx';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root ausente no index.html');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
