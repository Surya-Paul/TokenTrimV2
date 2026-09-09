import React from 'react';
import { createRoot } from 'react-dom/client';
import { PopupPanel } from './panels/PopupPanel';
import './popup.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
const root = createRoot(container);
root.render(<React.StrictMode><PopupPanel /></React.StrictMode>);