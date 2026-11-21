import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store/store';
import App from './App';
import CompareView from './components/CompareView';
import './styles.css';

// Cua so SO SANH DAP AN mo cung file index nay voi ?compare=1 (Electron
// BrowserWindow rieng) — chi render man hinh so sanh, khong can Redux.
const isCompare = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('compare') === '1';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isCompare ? (
      <CompareView />
    ) : (
      <Provider store={store}>
        <App />
      </Provider>
    )}
  </React.StrictMode>,
);
