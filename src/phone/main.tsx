import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PhoneApp from './PhoneApp';
import './phone.css';

// The phone door's entry (phone.html). Nothing here imports the desktop app:
// no three.js, no sky, no reader engine (docs/mobile.md).
createRoot(document.getElementById('phone')!).render(
  <StrictMode>
    <PhoneApp />
  </StrictMode>,
);
