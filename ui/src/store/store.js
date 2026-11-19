import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import councilReducer from './councilSlice';
import rootSaga from './councilSaga';

const STORAGE_KEY = 'council-ui-state-v1';

// Luu phien lam viec vao localStorage cua app de tat/mo lai khong mat dap an.
function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.topic || !parsed.answers) return undefined;
    // Phien luu tu ban cu chua co buoc tong hop Muse — bo sung mac dinh de
    // khong hong phien dang lam do.
    if (!parsed.synthesis) parsed.synthesis = { status: 'idle', answer: '' };
    if (parsed.phase === 'done' && !parsed.synthesis.answer) parsed.phase = 'synthesis';
    // Phien luu tu ban cu chua co workflow file — bo sung mac dinh.
    if (!parsed.files) {
      parsed.files = { workDir: '', sessionDir: '', sessionFolder: '', contextName: '', contextPath: '', contextText: '', recentFiles: [], recentSessions: [], history: [], sessionFiles: [] };
    }
    if (!parsed.files.recentSessions) parsed.files.recentSessions = [];
    if (parsed.topic && !parsed.topic.mode) parsed.topic.mode = 'deep';
    return { council: parsed };
  } catch (_) {
    return undefined;
  }
}

const sagaMiddleware = createSagaMiddleware();

export const store = configureStore({
  reducer: { council: councilReducer },
  middleware: (getDefault) => getDefault({ thunk: false }).concat(sagaMiddleware),
  preloadedState: loadPersisted(),
});

sagaMiddleware.run(rootSaga);

let saveTimer = null;
store.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.getState().council)); } catch (_) { /* bo qua */ }
  }, 300);
});
