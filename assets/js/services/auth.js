import { Store } from '../core/state.js';

export const Auth = {
  async init() {
    // Move Firebase auth listener here
    Store.user = null;
  }
};
