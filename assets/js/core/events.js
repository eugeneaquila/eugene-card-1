export const Events = {
  init() {
    document.addEventListener('click', this.handleClick);
  },

  on(target, event, callback) {
    target?.addEventListener(event, callback);
  },

  emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, {detail}));
  },

  handleClick(event) {
    const action = event.target.closest('[data-action]');
    if(action) {
      Events.emit(action.dataset.action, {event, action});
    }
  }
};
