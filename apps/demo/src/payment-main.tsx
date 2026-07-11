import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PaymentPage } from './payment/PaymentPage.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PaymentPage />
  </StrictMode>,
);
