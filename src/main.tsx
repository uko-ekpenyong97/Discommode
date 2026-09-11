import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import PortfolioGate from './portfolio/PortfolioGate.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PortfolioGate />
  </StrictMode>,
);
