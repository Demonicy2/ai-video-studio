import React from 'react';
import { createRoot } from 'react-dom/client';
import { StudioApp } from '../components/StudioApp.tsx';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<StudioApp />);
}

