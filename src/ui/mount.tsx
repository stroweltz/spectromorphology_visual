import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppShell, type EngineBridge } from './AppShell';
import './globals.css';

export function mountControlPanel(container: HTMLElement, engine: EngineBridge) {
  const root = ReactDOM.createRoot(container);
  root.render(<AppShell engine={engine} />);
  return root;
}
