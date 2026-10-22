import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import { applyTheme, getTheme } from './theme.js';

applyTheme(getTheme()); // before first render, so there is no flash of the wrong theme

createRoot(document.getElementById('root')).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
