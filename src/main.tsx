import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ReaderGate from './reader/ReaderGate.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReaderGate />
  </StrictMode>,
);
