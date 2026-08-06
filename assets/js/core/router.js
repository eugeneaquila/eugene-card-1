export const Router = {
  init() {
    window.addEventListener('hashchange', this.route);
    this.route();
  },

  route() {
    document.body.dataset.page =
      location.hash.substring(1) || 'home';
  }
};
