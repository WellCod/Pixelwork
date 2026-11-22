import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { App } from './App.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root ausente no index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
