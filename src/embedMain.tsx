import React from 'react';
import ReactDOM from 'react-dom/client';
import EmbedApp from './EmbedApp';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<EmbedApp />);
}
