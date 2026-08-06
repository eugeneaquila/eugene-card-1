import { Events } from './core/events.js';
import { Router } from './core/router.js';
import { Auth } from './services/auth.js';
import { Cards } from './modules/cards.js';
import { Trade } from './modules/trade.js';
import { Auction } from './modules/auction.js';
import { Inbox } from './modules/inbox.js';
import { Analytics } from './modules/analytics.js';
import { Admin } from './modules/admin.js';

export async function initApp() {
  Events.init();
  Router.init();

  await Auth.init();

  [
    Cards,
    Trade,
    Auction,
    Inbox,
    Analytics,
    Admin
  ].forEach(module => module.init());

  console.log("Eugene Card initialized");
}

initApp();
