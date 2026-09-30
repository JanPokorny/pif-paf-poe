import { chooseAction } from './ai.js';

self.onmessage = (e) => {
  const { id, state, opts } = e.data;
  self.postMessage({ id, action: chooseAction(state, opts) });
};
