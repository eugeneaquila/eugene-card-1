
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            amber: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' }
          },
          fontFamily: { sans: ['Inter', 'sans-serif'] }
        }
      }
    }
  

    (function(){
      function removeStrayText(root){
        if(!root) return;
        const walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes=[];
        let n;
        while(n=walker.nextNode()){
          const value=(n.nodeValue||'').trim();
          if(value==='\">' || value==='>\"') nodes.push(n);
        }
        nodes.forEach(node=>node.remove());
      }
      removeStrayText(document.body);
      const observer=new MutationObserver(function(){ removeStrayText(document.body); });
      observer.observe(document.body,{childList:true,subtree:true,characterData:true});
      setTimeout(()=>observer.disconnect(),15000);
    })();
  

    const firebaseConfig = {
      apiKey: "AIzaSyCm13Nh6k6W9wsL0_OPpjKZNrbSg-pFsuA",
      authDomain: "eugene-card-marketplace.firebaseapp.com",
      projectId: "eugene-card-marketplace",
      storageBucket: "eugene-card-marketplace.firebasestorage.app",
      messagingSenderId: "789014481646",
      appId: "1:789014481646:web:3858909b429985005a41ff",
      measurementId: "G-MRPT21P9M1"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();
    const analytics = firebase.analytics();

    // ---------------------------------------------------------------------
    // EmailJS — sends the admin (Eugene Card) a notification email every
    // time a new transaction lands in the Admin Hub approval queue
    // (a purchase order or a sell-back request with status PENDING).
    // NOTE: the Public Key below is meant to be exposed client-side, that's
    // how EmailJS works. The Private Key is NOT used here on purpose —
    // pasting it into this HTML file would expose it to anyone who views
    // page source / devtools, which defeats its purpose. If you want the
    // extra "strict mode" origin check, keep the Private Key only in your
    // EmailJS dashboard settings, not in client code.
    const EMAILJS_SERVICE_ID = 'service_bmzjam4';
    const EMAILJS_TEMPLATE_ID = 'template_kradqlq';
    const EMAILJS_PUBLIC_KEY = 'OzXPBb2X4h5MJ_-9X';
    const EMAILJS_ADMIN_TO = 'eugenecard.market@gmail.com';

    if (window.emailjs) {
      emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    }

    // Fires an EmailJS notification whenever a new item needs Admin approval.
    // `params` keys are passed straight through as EmailJS template variables —
    // make sure the names below (order_id, order_type, user_name, amount,
    // detail, to_email) match the variables used in template "template_kradqlq"
    // in the EmailJS dashboard (rename either side if they don't match).
    function sendAdminApprovalEmail(params) {
      if (!window.emailjs) {
        console.warn('EmailJS SDK not loaded, skipping approval email.');
        return;
      }
      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: EMAILJS_ADMIN_TO,
        order_id: params.order_id || '',
        order_type: params.order_type || '',
        user_name: params.user_name || '',
        amount: params.amount || '',
        detail: params.detail || '',
        created_at: new Date().toLocaleString()
      }).then(() => {
        console.log('Admin approval email sent for', params.order_id);
      }).catch((err) => {
        console.warn('Admin approval email failed:', err);
      });
    }

    const TRADE_FEE_PERCENT = 0.02;
    const OFFICIAL_QRIS_STRING = "00020101021126610014COM.GO-JEK.WWW01189360091430419400360210G0419400360303UMI51440014ID.CO.QRIS.WWW0215ID10265490344800303UMI5204504553033605802ID5921Eugene Card, Software6012TORAJA UTARA61059183162070703A016304BD68";
    // SECURITY NOTE (item 5 — "Admin should move away from client-side control"):
    // This list is used two ways:
    //  1. Cosmetic "ADMIN" badge labels next to a name/username elsewhere in the UI
    //     (harmless — matching against a display name here only changes a label).
    //  2. currentUser.isAdmin, which gates the Admin Hub, Inventory, and every
    //     approve/reject/edit action. Every real privilege check now calls
    //     isUserAdmin(currentUser.email) ONLY — never a user-editable name or
    //     username — because those were editable via Profile Settings and 'admin
    //     house' is literally in this array, so any account could rename itself
    //     into admin rights. See handleUserSession(), updateProfile(), and
    //     switchAccountPersona() for the fixed call sites.
    //  IMPORTANT: this is still a client-side check. Anyone with devtools open can
    //  set currentUser.isAdmin = true and the admin screens will render. That's
    //  fine for UI gating, but it means Firestore itself must independently refuse
    //  writes from non-admin accounts — this file has no way to enforce that from
    //  the browser. Pair this with Firestore Security Rules deployed server-side,
    //  e.g. `allow write: if request.auth.token.email in ['eugene.aquila06@gmail.com', 'yujinybwork@gmail.com'];`
    //  on the cards/transactions/listings/auction collections. Ask for a firestore.rules
    //  starter file if you don't have one yet.
    const ADMIN_EMAILS = ['eugene.aquila06@gmail.com', 'yujinybwork@gmail.com', 'eugene.aquila06', 'admin house'];

    // PayPal integration.
    // SECURITY NOTE: only the Client ID lives here (also passed to the PayPal SDK's
    // script include in the head). PayPal's Client ID is meant to be public — it identifies the app, not
    // a credential. The Secret Key is intentionally NOT in this file: this whole app is
    // client-side, so anything written here is readable by anyone via "View Source" or
    // devtools. The Secret Key is only needed for server-side order verification/capture
    // via PayPal's REST API (OAuth client_credentials grant) — there's no backend in this
    // project to hold it safely yet. The flow below uses PayPal's documented CLIENT-SIDE
    // capture pattern instead (paypal.Buttons + actions.order.capture()), which needs only
    // the Client ID.
    //   KNOWN LIMITATION: because createOrder() runs in the browser, someone with devtools
    //   open could in theory alter the USD amount before it's sent to PayPal. For a small
    //   marketplace this is a low-value target, but if you want it fully hardened later,
    //   the fix is a small serverless function (Firebase Cloud Function or a Supabase Edge
    //   Function — you already have both) that creates/verifies the order server-side using
    //   the Secret Key kept in that function's environment secrets, never in this file.
    const PAYPAL_CLIENT_ID = "BAAoYAiZbWF53NkwmMPFG6k-8ryBxtTILmGAUiLyoeAZRSXze-DcPKkOJ3d8rEfgUPAW8KAva3YF3WRnUo";
    const PAYPAL_FALLBACK_USD_IDR_RATE = 17800; // used only if the live rate fetch fails
    let cachedUsdIdrRate = null;
    let cachedRateFetchedAt = 0;
    let paypalButtonsRendered = false;

    let activePaymentMethod = 'QRIS';

    let currentLanguage = 'EN';
    let currentUser = null;
    let cart = [];
    let wishlist = new Set();
    let currentFilter = 'ALL';
    let historyFilter = 'ALL';
    let proofUrlById = {}; // txId -> qrisProofUrl, populated whenever a transaction list renders
    let inventory = [];
    let transactionsList = [];
    let ownerOptionsList = [];
    let tradeCardOptionsList = [];
    let systemNotifications = [];
    let activeListings = [];
    let activeAuction = null;
    let tradeRequestsList = [];
    let payoutRequestsList = [];
    let viewedCollectorFilter = null;
    let globalCollectorProfiles = {};
    // ===== PROFILES <-> USERS SYNC STATE =====
    // Raw per-collection snapshots, kept separately so either collection's
    // realtime listener can fire independently without wiping out the other's
    // data (see rebuildGlobalCollectorProfiles() below).
    let globalRawProfilesData = {};
    let globalRawUsersData = {};
    let activeDetailCardId = null;
    let marketProfilePanelOpen = false;
    let chartInstances = {};

    // ===== REAL VIEW / WATCHER TRACKING STATE =====
    let viewCountsMap = {};        // { cardId: totalViews }
    let cardPresenceMap = {};      // { sessionId: { cardId, lastSeen } }
    let watcherCountsByCard = {};  // { cardId: liveWatcherCount } — recomputed client-side
    let currentPresenceCardId = null;
    const WATCH_WINDOW_MS = 90 * 1000; // a session counts as "watching" if seen in the last 90s
    const HEARTBEAT_MS = 20 * 1000;

    let currentChatTargetUser = null;
    let currentChatContextId = null;
    let pendingConfirmAction = null;
    let chatUnsubscribe = null;
    let chatAttachedImage = null;
    let inboxUnsubscribe = null;
    let inboxThreadsCache = [];
    let inboxFilter = 'ALL';
    let inboxSearchQuery = '';
    const inboxPinnedThreads = new Set(JSON.parse(localStorage.getItem('eugene_inbox_pinned') || '[]'));

    let catalogSortMode = 'SERIAL';
    let catalogViewMode = 'GRID';
    let visibleCardCount = 10;
    const CARDS_PER_BATCH = 10;
    let scrollObserver = null;

    // ===== HOME PAGE: ACTIVE/OFFLINE MEMBERS + COMMUNITY FEED STATE =====
    let userPresenceMap = {};        // { uid: { name, username, avatarUrl, lastSeen } }
    const PRESENCE_ACTIVE_WINDOW_MS = 2 * 60 * 1000; // considered "active" if a heartbeat landed in the last 2 minutes
    const USER_HEARTBEAT_MS = 25 * 1000;
    let userHeartbeatInterval = null;
    let totalSiteVisitors = 0; // running count since the site's counter was introduced, synced from system/siteStats
    let postComposerImageDataUrl = null;
    let postsList = [];
    let openCommentsPostId = null;
    let postCommentsUnsubscribe = null;
    let postCommentsCache = {};      // { postId: [comments] }
    let openRepostMenuPostId = null;
    let originalPostsCache = {};     // { postId: post data } — for reposts/quotes whose original has scrolled out of the live 50-doc feed window
    let originalPostsFetching = {};  // { postId: true } — de-dupes in-flight fetches
    let quoteRepostTargetPostId = null;
    let quoteRepostImageDataUrl = null;

    // Comprehensive i18n Dictionary
    const i18nDict = {
      EN: {
        brandTitle: "EUGENE CARD",
        betaEdition: "Beta Edition",
        brandSubtitle: "Trading Card Marketplace & Exchange Hub",
        navCollection: "Collection",
        navTrade: "Trade",
        navAuction: "Auction",
        navRequests: "Trade Requests",
        navAnalytics: "Analytics",
        navInbox: "Inbox",
        navHolders: "Holders",
        navHistory: "History",
        navVault: "My Vault",
        navWishlist: "Wishlist",
        navInventory: "Inventory",
        navAdmin: "Admin Hub",
        navHome: "Home",
        homeTitle: "Community Home",
        homeSubtitle: "See who's online and share updates with the Eugene Card community.",
        homeHeroBadge: "COMMUNITY HUB",
        statTotalVisitors: "Total Visitors",
        statOnlineNow: "Online Now",
        whatsOnMindPlaceholder: "What's on your mind, collector?",
        attachImageBtn: "Attach Image",
        postBtn: "Post",
        loginToPostHint: "Log in to share a post with the community.",
        loadingFeed: "Loading feed...",
        noPostsYet: "No posts yet. Be the first to share something!",
        activeNowTitle: "Active Now",
        offlineTitle: "Offline",
        noActiveUsers: "No one online right now.",
        noOfflineUsers: "No other members yet.",
        likeBtnLabel: "Like",
        commentBtnLabel: "Comment",
        writeCommentPlaceholder: "Write a comment...",
        sendCommentBtn: "Send",
        noCommentsYet: "No comments yet.",
        deletePostConfirm: "Delete this post? This can't be undone.",
        postDeleted: "Post deleted.",
        postPublished: "Post published!",
        emptyPostWarning: "Write something or attach an image before posting.",
        repostBtnLabel: "Repost",
        undoRepostBtnLabel: "Undo Repost",
        quoteRepostBtnLabel: "Quote Repost",
        repostedLabel: "reposted",
        repostSuccessToast: "Reposted!",
        repostRemovedToast: "Repost removed.",
        originalPostUnavailable: "This post is no longer available.",
        quoteRepostModalTitle: "Quote Repost",
        quoteRepostPlaceholder: "Add a comment...",
        quoteRepostPublished: "Quote reposted!",
        welcomeBadge: "Welcome!",
        completeProfileTitle: "Complete Your Profile",
        completeProfileSub: "Just a couple of details so other collectors can recognize you on the marketplace.",
        saveContinueBtn: "Save & Continue",
        maybeLaterBtn: "Maybe later",
        notifHeader: "Cookie & Activity Logs",
        clearAll: "Clear All",
        noNotifications: "No recent notifications.",
        limitedEdition: "LIMITED EDITION",
        betaStockTitle: "Beta Edition Card Stock",
        betaStockSubtitle: "Official QRIS & PayPal Primary Market Availability (2% Tax Included)",
        heroHeadline: "Collect. Trade. Invest.",
        heroSubcopy: "Limited digital trading cards with unique serial numbers. Only 50 cards will ever exist.",
        exploreCollectionBtn: "Explore Collection",
        statTotalSupply: "Total Supply",
        statCollectors: "Collectors",
        statTradingVolume: "Trading Volume",
        marketProfileToggle: "Market Profile & History",
        mpCurrentValue: "Current Value",
        mpOriginalPrice: "Original Price",
        mpGrowth: "Growth",
        mpOwners: "Owners",
        mpTradeVolume: "Trade Volume",
        mpRarityIndex: "Rarity Index",
        mpLastSale: "Last Sale",
        mpNoSaleYet: "Not sold yet",
        mpHistoryTitle: "Ownership & Price History",
        mpHistoryEmpty: "No transaction history yet — this card hasn't changed hands.",
        mpHistoryInitial: "Initial Sale",
        mpHistoryTrade: "Trade #",
        mpHistoryCurrentOwner: "Current Owner",
        mpCollectors: "collectors",
        mpTransactions: "transactions",
        collectorLevelTitle: "Collector Level",
        collectorLevelCardsOwned: "Cards Owned",
        collectorLevelTradesCompleted: "Trades Completed",
        collectorLevelCollectionValue: "Collection Value",
        collectorLevelBadgesTitle: "Badges",
        badgeGenesis: "Genesis Member",
        badgeActiveTrader: "Active Trader",
        badgePremiumHolder: "Premium Holder",
        badgeCollector: "Collector",
        collectionCompletionTitle: "Genesis Collection",
        collectionCompletionCollected: "Cards Collected",
        collectionCompletionMissing: "Missing",
        collectionCompletionMissingMore: "more",
        collectionCompletionRewardLocked: "Collect all 50 to unlock the Genesis Master badge.",
        collectionCompletionRewardUnlocked: "Genesis Master badge unlocked! You own the complete series.",
        collectionCompletionEmpty: "Log in and start collecting to track your set completion.",
        remainingCards: "Remaining Cards",
        availableSuffix: "/ 50 Available",
        searchPlaceholder: "Search serial (*01 / *001) or card name...",
        filterAll: "All",
        filterPremium: "Premium",
        filterStandard: "Standard",
        featuredBadge: "Featured",
        featuredCardSubtitle: "This Week's Spotlight Card",
        trendingCardsTitle: "Trending Cards",
        liveActivityTitle: "Live Marketplace Activity",
        liveWord: "Live",
        rarityDistributionTitle: "Rarity Distribution",
        marketCollectionProgressTitle: "Collection Progress",
        fullCatalogTitle: "Full Catalog",
        noCardsAvailableYet: "No cards available yet.",
        priceWord: "Price",
        viewDetailsBtn: "View Details",
        noCardsYetShort: "No cards yet.",
        hotBadge: "Hot",
        noActivityYet: "No marketplace activity yet — be the first to collect a card!",
        nowWord: "now",
        cardsWord: "cards",
        noCardsMatchFilter: "No cards match your filter criteria.",
        unownedShort: "Unowned",
        loadingMoreCards: "Loading more cards...",
        serialWord: "Serial",
        premiumEditionWord: "Premium Edition",
        standardEditionWord: "Standard Edition",
        earlyReleaseLabel: "Early release (first 5 minted)",
        lowSerialLabel: "Low serial number",
        activelyHeldLabel: "Actively held by a collector",
        notEnoughSalesLabel: "Not enough sales yet to chart a price trend.",
        rarityScoreTitle: "Rarity Score",
        priceHistoryTitle: "Price History",
        ownershipChainTitle: "Ownership Chain",
        collectorFallback: "Collector",
        houseLabel: "House",
        activitySoldTo: "sold to",
        activityProposedTradeFor: "proposed a trade for",
        aCardFallback: "A card",
        aCollectorFallback: "a collector",
        tradeRoomTitle: "TRADING ROOM",
        tradeRoomSubtitle: "Buy and sell directly with other collectors via QRIS / PayPal • 2% tax per trade",
        listCardBtn: "List a Card",
        auctionRoomTitle: "AUCTION ROOM",
        auctionRoomSubtitle: "Place competitive bids on rare serial cards before timer expires.",
        featuredAuction: "FEATURED AUCTION",
        timeRemaining: "Time Remaining",
        ownerLabel: "Owner",
        highestBid: "Current Highest Bid",
        highBidderLabel: "High Bidder",
        bidAmountLabel: "Your Bid Amount (IDR) - QRIS / PayPal",
        placeBidBtn: "Place Bid",
        liveBidHistory: "Live Bid History",
        tradeReqTitle: "TRADE REQUESTS",
        tradeReqSubtitle: "Propose buy or trade offers on cards that already have an owner.",
        proposeTradeBtn: "Propose Card Trade",
        exclusiveAccess: "EXCLUSIVE ACCESS",
        analyticsTitle: "Market Analytics & Valuation",
        analyticsSubtitle: "Real-time marketplace metrics, floor price trends, and volume statistics.",
        refreshAnalytics: "Refresh Analytics",
        totalVolume: "Total Marketplace Volume",
        volumeTrend: "+14.2% this week",
        avgFloorPrice: "Average Floor Price",
        acrossCards: "Across 50 edition cards",
        collectedOwned: "Collected / Owned",
        holdersSub: "Primary & Secondary holders",
        activeTradeReqs: "Active Trade Requests",
        pendingCountered: "Pending & countered",
        topValuationIndex: "Top Card Valuation Index",
        navRevenueTab: "Revenue",
        revenueTabTitle: "Revenue Overview",
        revenueTabSubtitle: "Gross sales, platform tax, and per-card profitability from approved orders.",
        openFullRevenueHub: "Full Revenue Hub",
        kpiGrossSales: "GROSS SALES REVENUE",
        kpiTax: "PLATFORM TAX (2%)",
        kpiCompleted: "COMPLETED SALES",
        kpiAov: "AVERAGE ORDER VALUE",
        breakdownTitle: "CARD-LEVEL PROFITABILITY BREAKDOWN",
        btnAddToCart: "Add to Cart",
        btnOwned: "Owned",
        inboxTitle: "Direct Messages & Support Inbox",
        inboxSubtitle: "Search collectors to start a chat or view ongoing direct conversations.",
        refreshInbox: "Refresh Inbox",
        findCollector: "Find & Chat Collector",
        chatSearchPlaceholder: "Type collector name or email to start a chat...",
        loadingMessages: "Loading messages...",
        chatDirectTitle: "Direct Trade Chat",
        chatDirectSub: "Negotiate trade terms directly",
        noChatMessages: "No chat messages yet. Start the conversation!",
        chatInputPlaceholder: "Type message or attach screenshot...",
        btnSend: "Send",
        historyTitle: "Transaction History",
        historySubtitle: "View completed QRIS & PayPal purchases, order statuses, and 2% platform tax records.",
        histAll: "All Activity",
        histMine: "My Purchases",
        histApproved: "Approved Only",
        thOrderRef: "Order Ref",
        thBuyer: "Buyer",
        thItems: "Items Acquired",
        thAmount: "Amount (IDR + 2% Tax)",
        thProof: "Payment Receipt",
        thStatus: "Status",
        thDate: "Date / Time",
        vaultTitle: "My Vault / Binder",
        vaultSubtitle: "Manage owned cards, sell back instantly to Admin, or place them into Auction/Trade.",
        profileSettingsBtn: "Profile Settings",
        wishlistTitle: "Saved Wishlist",
        wishlistSubtitle: "Click on any card to directly propose a trade offer to its owner!",
        holdersHeroBadge: "COLLECTOR DIRECTORY",
        holdersTitle: "Holders Directory",
        holdersSubtitle: "Click on any collector row or card serial to view their collection and send direct trade offers.",
        statTotalHolders: "Total Holders",
        statCardsDistributed: "Cards Distributed",
        thOwnerName: "Owner Name",
        thCardsOwned: "Cards Owned",
        thSerialsHeld: "Serials Held",
        thAction: "Action",
        adminHubTitle: "Admin Hub & Revenue Dashboard",
        adminHubSubtitle: "Review customer QRIS & PayPal payments and verify order requests.",
        refreshHub: "Refresh Hub",
        personaSwitcherTitle: "Admin Persona Switcher (Test Accounts)",
        personaSwitcherSub: "Switch active account persona to test standard collector views versus admin privileges.",
        adminPersona: "Admin Persona",
        stdCollectorPersona: "Standard Collector",
        pendingOrdersTitle: "Pending Orders Requiring Action",
        noPendingOrders: "No pending transactions requiring approval.",
        inventoryTitle: "Inventory Mgmt",
        inventorySubtitle: "Manage, edit, export, or import complete inventory backup state JSON.",
        backupJson: "Backup JSON",
        importBackup: "Import Backup",
        searchInventoryPlaceholder: "Search serial / name / owner...",
        thSerial: "Serial",
        thName: "Name",
        thEdition: "Edition",
        thPrice: "Price",
        thAssignedOwner: "Assigned Owner",
        thActions: "Actions",
        listCardTradeTitle: "List Card for Trade",
        selectVaultCard: "Select Card from Your Vault",
        askingPrice: "Asking Price (IDR)",
        publishListingBtn: "Publish Listing",
        proposeModalTitle: "Propose Trade Offer",
        selectCardRequest: "Select Card to Request (Search by Serial or Owner)",
        selectCardPlaceholder: "Select a card...",
        tradeSearchPlaceholder: "Search serial (*01) or owner...",
        offerTypeLabel: "Offer Type",
        optDirectBuy: "Direct Buy Offer (QRIS / PayPal)",
        optCardTrade: "Card-for-Card Trade",
        selectMyCardOffer: "Select Your Card to Offer in Trade",
        plusAmountLabel: "Plus Cash / Top-up Amount (IDR - Optional)",
        proposedNotesLabel: "Proposed Offer Amount / Notes (IDR or Details)",
        tradeNotesPlaceholder: "e.g. Offering Rp 150.000 or trade with *02",
        submitProposalBtn: "Submit Proposal",
        counterModalTitle: "Send Counter Offer",
        counterNotesLabel: "Your Counter Terms / Revised Offer Notes",
        counterNotesPlaceholder: "e.g. Counter offer: I want Rp 250.000 or *05 instead.",
        submitCounterBtn: "Submit Counter Offer",
        processingData: "Processing Data...",
        loadingWaitSub: "Please wait while the inventory updates.",
        profileSettingsTitle: "Collector Profile Settings",
        profileSettingsSub: "Customize how your profile, username, and socials appear on the marketplace",
        displayNameLabel: "Display Name",
        usernameLabel: "Username (@handle - Unique)",
        emailLabel: "Email (Account)",
        uploadAvatarLabel: "Upload Custom Avatar Picture",
        avatarUrlLabel: "Or Avatar Image URL",
        bioLabel: "Collector Tagline / Bio",
        bioPlaceholder: "e.g. Genesis Card Enthusiast",
        socialsTitle: "Social Media & Links (Optional)",
        igLabel: "Instagram Handle / URL",
        twitterLabel: "X/Twitter Handle / URL",
        tiktokLabel: "TikTok Handle / URL",
        webLabel: "Website URL (Clickable)",
        saveProfileBtn: "Save Profile Updates",

        marketIntelligenceChip: "Market Intelligence",
        marketIntelligenceTitle: "Know the market before you collect.",
        marketIntelligenceSub: "Live indicators calculated from the cards and approved marketplace transactions available to this app.",
        liveMarketplaceData: "Live marketplace data",
        recentSalesTitle: "Recent Sales",
        transactionPulse: "Transaction pulse",
        pricingContextTitle: "Pricing Context",
        whereMarketSits: "Where the market sits",
        approvedSales: "approved sales",
        approvedSalesWillAppear: "Approved sales will appear here as the marketplace grows.",
        marketFloorPrice: "Floor Price",
        marketAveragePrice: "Average Price",
        marketMedianPrice: "Median Price",
        marketTopSale: "Top Sale",
        marketLiquidity: "Liquidity",
        lowestCurrentlyAvailable: "Lowest currently available",
        cardsTracked: "cards tracked",
        middleCurrentCatalog: "Middle of current catalog",
        highestApprovedSale: "Highest approved sale",
        highestRecordedCardValue: "Highest recorded card value",
        distributedSold: "distributed / sold",
        liveMarketplaceActivityTitle: "Live Marketplace Activity",
        recentMovementCollection: "Recent movement across the collection.",
        marketInsightsTitle: "Market Insights",
        collectionComposition: "Collection composition at a glance.",
        collectorIdentityTitle: "Collector Identity",
        publicReputation: "Your public reputation across Eugene Card.",
        reputationLabel: "Reputation",
        tradesLabel: "Trades",
        badgesLabel: "Badges",
        collectorAchievementsTitle: "Collector Achievements",
        earnedFromActivity: "Earned from your activity",
        startConversation: "Start the conversation",
        sendMessageOrScreenshot: "Send a message or share a card screenshot.",
        privateEncrypted: "Private & encrypted",
        latestLabel: "Latest",
        conversationLabel: "Conversation",
        enterToSend: "Enter to send",
        attachScreenshotsHint: "Attach screenshots with the paperclip",
        marketCardsTracked: "cards tracked",
        collectedSuffix: "collected",
        reputationGrowthHint: "Reputation grows with verified marketplace activity.",
        achievementFirstCollector: "First Collector",
        achievementPremiumHunter: "Premium Hunter",
        achievementTrader: "Trader",
        achievementActiveCollector: "Active Collector",
        achievementVaultBuilder: "Vault Builder",

        customizeCardTitle: "Customize Card Details",
        cardNameLabel: "Card Name",
        cardCodeLabel: "Card Code (e.g. *01 / *001)",
        categoryLabel: "Type / Category",
        extendedDetails: "Extended Details",
        editionLabel: "Edition",
        snLabel: "SN (Serial No.)",
        tierLabel: "Tier",
        printingLabel: "Printing",
        priceLabel: "Price (IDR)",
        statusLabel: "Status",
        optAvailable: "AVAILABLE",
        optSold: "SOLD",
        assignOwnerLabel: "Assign Owner",
        unownedHouse: "Unowned (House)",
        searchOwnerPlaceholder: "Search collector name...",
        uploadCardImgLabel: "Upload Card Image File",
        orImgUrlLabel: "Or Image URL",
        saveCustomizationBtn: "Save Customization",
        currentOwner: "Current Owner:",
        floorPrice: "Floor Price:",
        availability: "Availability:",
        loginTitle: "Log In to Eugene Card",
        loginSub: "Sign in to customize your collector profile and trade cards.",
        continueGoogle: "Continue with Google",
        cartTitle: "Cart Checkout",
        subtotal: "Subtotal",
        platformTax: "Platform Tax (2%)",
        totalIncTax: "Total (Inc. 2% Tax)",
        proceedQrisBtn: "Proceed to Payment",
        scanPayQris: "Scan & Pay via Official QRIS",
        merchantLabel: "Merchant",
        totalPayAmount: "Total Payment Amount (Inc. 2% Platform Tax)",
        uploadReceiptLabel: "Upload QRIS Transfer Receipt Screenshot",
        submitQrisOrderBtn: "Submit Order for Admin Approval"
      },
      ID: {
        brandTitle: "EUGENE CARD",
        betaEdition: "Edisi Beta",
        brandSubtitle: "Pasar Kartu Koleksi & Pusat Pertukaran",
        navCollection: "Koleksi",
        navTrade: "Perdagangan",
        navAuction: "Lelang",
        navRequests: "Permintaan Tukar",
        navAnalytics: "Analitik",
        navInbox: "Pesan",
        navHolders: "Kolektor",
        navHistory: "Riwayat",
        navVault: "Brankas",
        navWishlist: "Keinginan",
        navInventory: "Inventaris",
        navAdmin: "Admin Hub",
        navHome: "Beranda",
        homeTitle: "Beranda Komunitas",
        homeSubtitle: "Lihat siapa yang sedang online dan bagikan pembaruan dengan komunitas Eugene Card.",
        homeHeroBadge: "PUSAT KOMUNITAS",
        statTotalVisitors: "Total Pengunjung",
        statOnlineNow: "Online Sekarang",
        whatsOnMindPlaceholder: "Apa yang sedang Anda pikirkan, kolektor?",
        attachImageBtn: "Lampirkan Gambar",
        postBtn: "Kirim",
        loginToPostHint: "Masuk untuk membagikan postingan dengan komunitas.",
        loadingFeed: "Memuat linimasa...",
        noPostsYet: "Belum ada postingan. Jadilah yang pertama berbagi sesuatu!",
        activeNowTitle: "Aktif Sekarang",
        offlineTitle: "Offline",
        noActiveUsers: "Belum ada yang online sekarang.",
        noOfflineUsers: "Belum ada anggota lain.",
        likeBtnLabel: "Suka",
        commentBtnLabel: "Komentar",
        writeCommentPlaceholder: "Tulis komentar...",
        sendCommentBtn: "Kirim",
        noCommentsYet: "Belum ada komentar.",
        deletePostConfirm: "Hapus postingan ini? Tindakan ini tidak dapat dibatalkan.",
        postDeleted: "Postingan dihapus.",
        postPublished: "Postingan berhasil dikirim!",
        emptyPostWarning: "Tulis sesuatu atau lampirkan gambar sebelum mengirim.",
        repostBtnLabel: "Bagikan Ulang",
        undoRepostBtnLabel: "Batalkan Bagikan Ulang",
        quoteRepostBtnLabel: "Kutip & Bagikan Ulang",
        repostedLabel: "membagikan ulang",
        repostSuccessToast: "Berhasil dibagikan ulang!",
        repostRemovedToast: "Bagikan ulang dibatalkan.",
        originalPostUnavailable: "Postingan ini sudah tidak tersedia.",
        quoteRepostModalTitle: "Kutip & Bagikan Ulang",
        quoteRepostPlaceholder: "Tambahkan komentar...",
        quoteRepostPublished: "Berhasil dikutip & dibagikan ulang!",
        welcomeBadge: "Selamat Datang!",
        completeProfileTitle: "Lengkapi Profil Anda",
        completeProfileSub: "Beberapa detail singkat agar kolektor lain dapat mengenali Anda di marketplace.",
        saveContinueBtn: "Simpan & Lanjutkan",
        maybeLaterBtn: "Nanti saja",
        notifHeader: "Cookie & Catatan Aktivitas",
        clearAll: "Hapus Semua",
        noNotifications: "Tidak ada notifikasi terbaru.",
        limitedEdition: "EDISI TERBATAS",
        betaStockTitle: "Stok Kartu Edisi Beta",
        betaStockSubtitle: "Ketersediaan Pasar Primer QRIS & PayPal Resmi (Pajak 2% Termasuk)",
        heroHeadline: "Koleksi. Perdagangkan. Investasikan.",
        heroSubcopy: "Kartu koleksi digital terbatas dengan nomor seri unik. Hanya 50 kartu yang akan pernah ada.",
        exploreCollectionBtn: "Jelajahi Koleksi",
        statTotalSupply: "Total Pasokan",
        statCollectors: "Kolektor",
        statTradingVolume: "Volume Perdagangan",
        marketProfileToggle: "Profil Pasar & Riwayat",
        mpCurrentValue: "Nilai Saat Ini",
        mpOriginalPrice: "Harga Awal",
        mpGrowth: "Pertumbuhan",
        mpOwners: "Pemilik",
        mpTradeVolume: "Volume Perdagangan",
        mpRarityIndex: "Indeks Kelangkaan",
        mpLastSale: "Penjualan Terakhir",
        mpNoSaleYet: "Belum terjual",
        mpHistoryTitle: "Riwayat Kepemilikan & Harga",
        mpHistoryEmpty: "Belum ada riwayat transaksi — kartu ini belum berpindah tangan.",
        mpHistoryInitial: "Penjualan Awal",
        mpHistoryTrade: "Perdagangan #",
        mpHistoryCurrentOwner: "Pemilik Saat Ini",
        mpCollectors: "kolektor",
        mpTransactions: "transaksi",
        collectorLevelTitle: "Level Kolektor",
        collectorLevelCardsOwned: "Kartu Dimiliki",
        collectorLevelTradesCompleted: "Perdagangan Selesai",
        collectorLevelCollectionValue: "Nilai Koleksi",
        collectorLevelBadgesTitle: "Lencana",
        badgeGenesis: "Anggota Genesis",
        badgeActiveTrader: "Trader Aktif",
        badgePremiumHolder: "Pemegang Premium",
        badgeCollector: "Kolektor",
        collectionCompletionTitle: "Koleksi Genesis",
        collectionCompletionCollected: "Kartu Terkumpul",
        collectionCompletionMissing: "Kurang",
        collectionCompletionMissingMore: "lainnya",
        collectionCompletionRewardLocked: "Kumpulkan 50 kartu untuk membuka lencana Genesis Master.",
        collectionCompletionRewardUnlocked: "Lencana Genesis Master terbuka! Anda memiliki koleksi lengkap.",
        collectionCompletionEmpty: "Masuk dan mulai mengoleksi untuk melacak kelengkapan set Anda.",
        remainingCards: "Sisa Kartu",
        availableSuffix: "/ 50 Tersedia",
        searchPlaceholder: "Cari serial (*01 / *001) atau nama kartu...",
        filterAll: "Semua",
        filterPremium: "Premium",
        filterStandard: "Standar",
        featuredBadge: "Unggulan",
        featuredCardSubtitle: "Kartu Sorotan Minggu Ini",
        trendingCardsTitle: "Kartu Sedang Tren",
        liveActivityTitle: "Aktivitas Pasar Langsung",
        liveWord: "Langsung",
        rarityDistributionTitle: "Distribusi Kelangkaan",
        marketCollectionProgressTitle: "Progres Koleksi",
        fullCatalogTitle: "Katalog Lengkap",
        noCardsAvailableYet: "Belum ada kartu yang tersedia.",
        priceWord: "Harga",
        viewDetailsBtn: "Lihat Detail",
        noCardsYetShort: "Belum ada kartu.",
        hotBadge: "Populer",
        noActivityYet: "Belum ada aktivitas pasar — jadilah yang pertama mengoleksi kartu!",
        nowWord: "sekarang",
        cardsWord: "kartu",
        noCardsMatchFilter: "Tidak ada kartu yang cocok dengan filter Anda.",
        unownedShort: "Belum Dimiliki",
        loadingMoreCards: "Memuat kartu lainnya...",
        serialWord: "Serial",
        premiumEditionWord: "Edisi Premium",
        standardEditionWord: "Edisi Standar",
        earlyReleaseLabel: "Rilis awal (5 pertama dicetak)",
        lowSerialLabel: "Nomor seri rendah",
        activelyHeldLabel: "Sedang dimiliki kolektor aktif",
        notEnoughSalesLabel: "Belum cukup data penjualan untuk menampilkan tren harga.",
        rarityScoreTitle: "Skor Kelangkaan",
        priceHistoryTitle: "Riwayat Harga",
        ownershipChainTitle: "Rantai Kepemilikan",
        collectorFallback: "Kolektor",
        houseLabel: "Rumah",
        activitySoldTo: "terjual kepada",
        activityProposedTradeFor: "mengajukan tukar untuk",
        aCardFallback: "Sebuah kartu",
        aCollectorFallback: "seorang kolektor",
        tradeRoomTitle: "RUANG PERDAGANGAN",
        tradeRoomSubtitle: "Beli dan jual langsung dengan kolektor lain via QRIS / PayPal • Pajak 2% per transaksi",
        listCardBtn: "Jual/Tukar Kartu",
        auctionRoomTitle: "RUANG LELANG",
        auctionRoomSubtitle: "Ajukan penawaran kompetitif pada kartu langka sebelum waktu habis.",
        featuredAuction: "LELANG UTAMA",
        timeRemaining: "Sisa Waktu",
        ownerLabel: "Pemilik",
        highestBid: "Penawaran Tertinggi",
        highBidderLabel: "Penawar Tertinggi",
        bidAmountLabel: "Jumlah Penawaran (IDR) - QRIS / PayPal",
        placeBidBtn: "Ajukan Tawaran",
        liveBidHistory: "Riwayat Tawaran Langsung",
        tradeReqTitle: "PERMINTAAN TUKAR",
        tradeReqSubtitle: "Ajukan penawaran beli/tukar untuk kartu yang sudah dimiliki kolektor lain.",
        proposeTradeBtn: "Ajukan Penawaran",
        exclusiveAccess: "AKSES EKSKLUSIF",
        analyticsTitle: "Analitik Pasar & Valuasi",
        analyticsSubtitle: "Metrik pasar real-time, tren harga dasar, dan statistik volume.",
        refreshAnalytics: "Muat Ulang Analitik",
        totalVolume: "Total Volume Pasar",
        volumeTrend: "+14.2% minggu ini",
        avgFloorPrice: "Rata-rata Harga Dasar",
        acrossCards: "Dari 50 kartu edisi",
        collectedOwned: "Terkumpul / Dimiliki",
        holdersSub: "Pemegang Primer & Sekunder",
        activeTradeReqs: "Permintaan Tukar Aktif",
        pendingCountered: "Menunggu & Kontra",
        topValuationIndex: "Indeks Valuasi Kartu Teratas",
        navRevenueTab: "Pendapatan",
        revenueTabTitle: "Ikhtisar Pendapatan",
        revenueTabSubtitle: "Penjualan kotor, pajak platform, dan profitabilitas per kartu dari pesanan yang disetujui.",
        openFullRevenueHub: "Buka Pusat Pendapatan",
        kpiGrossSales: "PENDAPATAN PENJUALAN KOTOR",
        kpiTax: "PAJAK PLATFORM (2%)",
        kpiCompleted: "PENJUALAN SELESAI",
        kpiAov: "RATA-RATA NILAI PESANAN",
        breakdownTitle: "RINCIAN PROFITABILITAS PER KARTU",
        btnAddToCart: "Tambah ke Keranjang",
        btnOwned: "Dimiliki",
        inboxTitle: "Pesan Langsung & Kotak Masuk",
        inboxSubtitle: "Cari kolektor untuk memulai obrolan atau melihat percakapan aktif.",
        refreshInbox: "Muat Ulang Pesan",
        findCollector: "Cari & Chat Kolektor",
        chatSearchPlaceholder: "Ketik nama kolektor atau email...",
        loadingMessages: "Memuat pesan...",
        chatDirectTitle: "Chat Perdagangan Langsung",
        chatDirectSub: "Negosiasikan syarat perdagangan secara langsung",
        noChatMessages: "Belum ada pesan chat. Mulai percakapan!",
        chatInputPlaceholder: "Ketik pesan atau lampirkan tangkapan layar...",
        btnSend: "Kirim",
        historyTitle: "Riwayat Transaksi",
        historySubtitle: "Lihat pembelian QRIS & PayPal selesai, status pesanan, dan catatan pajak platform 2%.",
        histAll: "Semua Aktivitas",
        histMine: "Pembelian Saya",
        histApproved: "Disetujui Saja",
        thOrderRef: "Ref Pesanan",
        thBuyer: "Pembeli",
        thItems: "Kartu Didapat",
        thAmount: "Jumlah (IDR + Pajak 2%)",
        thProof: "Bukti Pembayaran",
        thStatus: "Status",
        thDate: "Tanggal / Waktu",
        vaultTitle: "Brankas / Album Saya",
        vaultSubtitle: "Kelola kartu yang dimiliki, jual kembali secara instan ke Admin, atau masukkan ke Lelang/Tukar.",
        profileSettingsBtn: "Pengaturan Profil",
        wishlistTitle: "Daftar Keinginan",
        wishlistSubtitle: "Klik kartu apa saja untuk langsung mengajukan penawaran tukar kepada pemiliknya!",
        holdersHeroBadge: "DIREKTORI KOLEKTOR",
        holdersTitle: "Direktori Kolektor",
        holdersSubtitle: "Klik baris kolektor atau serial kartu untuk melihat koleksi dan mengirim tawaran.",
        statTotalHolders: "Total Kolektor",
        statCardsDistributed: "Kartu Terdistribusi",
        thOwnerName: "Nama Kolektor",
        thCardsOwned: "Jumlah Kartu",
        thSerialsHeld: "Serial Dipegang",
        thAction: "Aksi",
        adminHubTitle: "Pusat Admin & Dasbor Pendapatan",
        adminHubSubtitle: "Tinjau pembayaran QRIS & PayPal pelanggan dan verifikasi permintaan pesanan.",
        refreshHub: "Muat Ulang Pusat",
        personaSwitcherTitle: "Pengalih Persona Admin (Akun Uji)",
        personaSwitcherSub: "Beralih persona akun aktif untuk menguji tampilan kolektor standar vs hak akses admin.",
        adminPersona: "Persona Admin",
        stdCollectorPersona: "Kolektor Standar",
        pendingOrdersTitle: "Pesanan Menunggu Tindakan",
        noPendingOrders: "Tidak ada transaksi menunggu persetujuan.",
        inventoryTitle: "Manajemen Inventaris",
        inventorySubtitle: "Kelola, edit, ekspor, atau impor JSON cadangan inventaris lengkap.",
        backupJson: "Cadangkan JSON",
        importBackup: "Impor Cadangan",
        searchInventoryPlaceholder: "Cari serial / nama / pemilik...",
        thSerial: "Serial",
        thName: "Nama",
        thEdition: "Edisi",
        thPrice: "Harga",
        thAssignedOwner: "Pemilik Ditugaskan",
        thActions: "Aksi",
        listCardTradeTitle: "Daftarkan Kartu untuk Dijual/Ditukar",
        selectVaultCard: "Pilih Kartu dari Brankas Anda",
        askingPrice: "Harga Penawaran (IDR)",
        publishListingBtn: "Publikasikan Kartu",
        proposeModalTitle: "Ajukan Penawaran",
        selectCardRequest: "Pilih Kartu yang Diminta (Cari berdasarkan Serial atau Pemilik)",
        selectCardPlaceholder: "Pilih kartu...",
        tradeSearchPlaceholder: "Cari serial (*01) atau pemilik...",
        offerTypeLabel: "Jenis Penawaran",
        optDirectBuy: "Penawaran Beli Langsung (QRIS / PayPal)",
        optCardTrade: "Pertukaran Kartu-dengan-Kartu",
        selectMyCardOffer: "Pilih Kartu Anda untuk Ditawarkan",
        plusAmountLabel: "Jumlah Uang Tambahan (IDR - Opsional)",
        proposedNotesLabel: "Jumlah Penawaran / Catatan (IDR atau Rincian)",
        tradeNotesPlaceholder: "misal: Menawarkan Rp 150.000 atau tukar dengan *02",
        submitProposalBtn: "Kirim Proposal",
        counterModalTitle: "Kirim Penawaran Kontra",
        counterNotesLabel: "Ketentuan Kontra / Catatan Penawaran Revisi Anda",
        counterNotesPlaceholder: "misal: Penawaran kontra: Saya minta Rp 250.000 atau *05 sebagai gantinya.",
        submitCounterBtn: "Kirim Penawaran Kontra",
        processingData: "Memproses Data...",
        loadingWaitSub: "Harap tunggu sementara inventaris diperbarui.",
        profileSettingsTitle: "Pengaturan Profil Kolektor",
        profileSettingsSub: "Sesuaikan tampilan profil, username, dan media sosial Anda di pasar",
        displayNameLabel: "Nama Tampilan",
        usernameLabel: "Username (@handle - Unik)",
        emailLabel: "Email (Akun)",
        uploadAvatarLabel: "Unggah Foto Profil Kustom",
        avatarUrlLabel: "Atau URL Gambar Avatar",
        bioLabel: "Slogan / Bio Kolektor",
        bioPlaceholder: "misal: Penggemar Kartu Genesis",
        socialsTitle: "Media Sosial & Tautan (Opsional)",
        igLabel: "Handle / URL Instagram",
        twitterLabel: "Handle / URL X/Twitter",
        tiktokLabel: "Handle / URL TikTok",
        webLabel: "URL Situs Web (Dapat Diklik)",
        saveProfileBtn: "Simpan Perubahan Profil",

        marketIntelligenceChip: "Intelijen Pasar",
        marketIntelligenceTitle: "Pahami pasar sebelum mengoleksi.",
        marketIntelligenceSub: "Indikator langsung dihitung dari kartu dan transaksi marketplace yang telah disetujui.",
        liveMarketplaceData: "Data marketplace langsung",
        recentSalesTitle: "Penjualan Terbaru",
        transactionPulse: "Aktivitas transaksi",
        pricingContextTitle: "Konteks Harga",
        whereMarketSits: "Posisi harga pasar",
        approvedSales: "penjualan disetujui",
        approvedSalesWillAppear: "Penjualan yang disetujui akan muncul di sini seiring marketplace berkembang.",
        marketFloorPrice: "Harga Dasar",
        marketAveragePrice: "Harga Rata-rata",
        marketMedianPrice: "Harga Median",
        marketTopSale: "Penjualan Tertinggi",
        marketLiquidity: "Likuiditas",
        lowestCurrentlyAvailable: "Harga terendah yang tersedia",
        cardsTracked: "kartu dilacak",
        middleCurrentCatalog: "Nilai tengah katalog saat ini",
        highestApprovedSale: "Penjualan disetujui tertinggi",
        highestRecordedCardValue: "Nilai kartu tertinggi yang tercatat",
        distributedSold: "terdistribusi / terjual",
        liveMarketplaceActivityTitle: "Aktivitas Marketplace Langsung",
        recentMovementCollection: "Pergerakan terbaru di seluruh koleksi.",
        marketInsightsTitle: "Wawasan Pasar",
        collectionComposition: "Komposisi koleksi secara ringkas.",
        collectorIdentityTitle: "Identitas Kolektor",
        publicReputation: "Reputasi publik Anda di Eugene Card.",
        reputationLabel: "Reputasi",
        tradesLabel: "Tukar",
        badgesLabel: "Lencana",
        collectorAchievementsTitle: "Pencapaian Kolektor",
        earnedFromActivity: "Diperoleh dari aktivitas Anda",
        startConversation: "Mulai percakapan",
        sendMessageOrScreenshot: "Kirim pesan atau bagikan tangkapan layar kartu.",
        privateEncrypted: "Pribadi & terenkripsi",
        latestLabel: "Terbaru",
        conversationLabel: "Percakapan",
        enterToSend: "Enter untuk mengirim",
        attachScreenshotsHint: "Lampirkan tangkapan layar dengan ikon klip",
        marketCardsTracked: "kartu dilacak",
        collectedSuffix: "dikoleksi",
        reputationGrowthHint: "Reputasi meningkat melalui aktivitas marketplace yang terverifikasi.",
        achievementFirstCollector: "Kolektor Pertama",
        achievementPremiumHunter: "Pemburu Premium",
        achievementTrader: "Trader",
        achievementActiveCollector: "Kolektor Aktif",
        achievementVaultBuilder: "Pembangun Vault",

        customizeCardTitle: "Kustomisasi Rincian Kartu",
        cardNameLabel: "Nama Kartu",
        cardCodeLabel: "Kode Kartu (misal: *01 / *001)",
        categoryLabel: "Kategori / Tipe",
        extendedDetails: "Rincian Tambahan",
        editionLabel: "Edisi",
        snLabel: "SN (No. Serial)",
        tierLabel: "Tingkat (Tier)",
        printingLabel: "Pencetakan",
        priceLabel: "Harga (IDR)",
        statusLabel: "Status",
        optAvailable: "TERSEDIA",
        optSold: "TERJUAL",
        assignOwnerLabel: "Tugaskan Pemilik",
        unownedHouse: "Belum Dimiliki (Rumah)",
        searchOwnerPlaceholder: "Cari nama kolektor...",
        uploadCardImgLabel: "Unggah File Gambar Kartu",
        orImgUrlLabel: "Atau URL Gambar",
        saveCustomizationBtn: "Simpan Kustomisasi",
        currentOwner: "Pemilik Saat Ini:",
        floorPrice: "Harga Dasar:",
        availability: "Ketersediaan:",
        loginTitle: "Masuk ke Eugene Card",
        loginSub: "Masuk untuk menyesuaikan profil kolektor dan bertukar kartu.",
        continueGoogle: "Lanjutkan dengan Google",
        cartTitle: "Keranjang Pembayaran",
        subtotal: "Subtotal",
        platformTax: "Pajak Platform (2%)",
        totalIncTax: "Total (Termasuk Pajak 2%)",
        proceedQrisBtn: "Lanjutkan ke Pembayaran",
        scanPayQris: "Pindai & Bayar via QRIS Resmi",
        merchantLabel: "Pedagang",
        totalPayAmount: "Total Pembayaran (Termasuk Pajak 2%)",
        uploadReceiptLabel: "Unggah Tangkapan Layar Struk Transfer QRIS",
        submitQrisOrderBtn: "Kirim Pesanan untuk Persetujuan Admin"
      }
    };

    function toggleLanguage() {
      currentLanguage = currentLanguage === 'EN' ? 'ID' : 'EN';
      const btnLabel = document.getElementById('current-lang-label');
      if (btnLabel) btnLabel.innerText = currentLanguage;
      applyTranslations();
      if (!document.getElementById('view-catalog').classList.contains('hidden')) renderCardGrid();
      if (!document.getElementById('view-wishlist').classList.contains('hidden')) renderWishlistPage();
      if (!document.getElementById('view-home').classList.contains('hidden')) { renderHomeMembersList(); renderPostsFeed(); }
      if (typeof renderMarketIntelligence === 'function') renderMarketIntelligence();
      if (typeof renderCollectorReputationPanel === 'function' && currentUser) renderCollectorReputationPanel();
      if (typeof renderInboxThreads === 'function' && !document.getElementById('view-inbox').classList.contains('hidden')) renderInboxThreads();
      applyTranslations();
      showToast(currentLanguage === 'ID' ? 'Bahasa diubah ke Bahasa Indonesia' : 'Language switched to English');
    }

    function applyTranslations() {
      const dict = i18nDict[currentLanguage];
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) el.innerText = dict[key];
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key]) el.setAttribute('placeholder', dict[key]);
      });
    }


    function tr(key, fallback = '') {
      return (i18nDict[currentLanguage] && i18nDict[currentLanguage][key]) || fallback || key;
    }

    function switchCheckoutMethod(method) {
      activePaymentMethod = method;
      const qrisTab = document.getElementById('pay-tab-qris');
      const paypalTab = document.getElementById('pay-tab-paypal');
      const qrisContainer = document.getElementById('checkout-qris-container');
      const paypalContainer = document.getElementById('checkout-paypal-container');
      const manualSubmitSection = document.getElementById('checkout-manual-submit-section');

      if (method === 'PAYPAL') {
        paypalTab.className = 'flex-1 py-2 rounded-xl text-xs font-bold bg-sky-500 text-slate-950 transition-all flex items-center justify-center gap-1.5';
        qrisTab.className = 'flex-1 py-2 rounded-xl text-xs font-bold bg-slate-900 text-slate-400 hover:text-white transition-all flex items-center justify-center gap-1.5';
        qrisContainer.classList.add('hidden');
        paypalContainer.classList.remove('hidden');
        manualSubmitSection.classList.add('hidden'); // PayPal auto-confirms; no receipt/admin step
        renderPaypalButtons();
      } else {
        qrisTab.className = 'flex-1 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 transition-all flex items-center justify-center gap-1.5';
        paypalTab.className = 'flex-1 py-2 rounded-xl text-xs font-bold bg-slate-900 text-slate-400 hover:text-white transition-all flex items-center justify-center gap-1.5';
        paypalContainer.classList.add('hidden');
        qrisContainer.classList.remove('hidden');
        manualSubmitSection.classList.remove('hidden');
      }
    }

    // Live USD/IDR rate for converting the cart total, since PayPal cannot settle in IDR.
    // Cached in-memory for 5 minutes per session so we're not calling the rate API on
    // every tab click. Falls back to a fixed approximate rate if the fetch fails for any
    // reason (offline, CORS, rate-limited, etc.) so checkout never gets stuck.
    async function getUsdIdrRate() {
      const fiveMinutes = 5 * 60 * 1000;
      if (cachedUsdIdrRate && (Date.now() - cachedRateFetchedAt) < fiveMinutes) {
        return cachedUsdIdrRate;
      }
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        const rate = data && data.rates && data.rates.IDR;
        if (rate && rate > 0) {
          cachedUsdIdrRate = rate;
          cachedRateFetchedAt = Date.now();
          return rate;
        }
        throw new Error('IDR rate missing from response');
      } catch (e) {
        console.warn('Live exchange rate fetch failed, using fallback rate:', e.message);
        return PAYPAL_FALLBACK_USD_IDR_RATE;
      }
    }

    async function renderPaypalButtons() {
      const amountEl = document.getElementById('paypal-usd-amount');
      const rateNoteEl = document.getElementById('paypal-rate-note');
      const statusEl = document.getElementById('paypal-status-msg');
      const buttonContainer = document.getElementById('paypal-button-container');

      if (!currentUser) {
        amountEl.innerText = '—';
        statusEl.innerText = 'Please log in before paying with PayPal.';
        statusEl.classList.remove('hidden');
        return;
      }
      if (cart.length === 0) {
        amountEl.innerText = '—';
        return;
      }
      if (typeof paypal === 'undefined') {
        statusEl.innerText = 'PayPal could not load. Check your connection and reopen checkout.';
        statusEl.classList.remove('hidden');
        return;
      }

      statusEl.classList.add('hidden');
      amountEl.innerText = 'Calculating…';

      const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
      const totalIdr = subtotal * 1.02;
      const rate = await getUsdIdrRate();
      const usdAmount = Math.max(0.01, totalIdr / rate).toFixed(2);

      amountEl.innerText = `$${usdAmount} USD`;
      rateNoteEl.innerText = `Converted from ${formatIDR(totalIdr)} at an approximate rate of 1 USD ≈ Rp ${Math.round(rate).toLocaleString('en-US')}. PayPal may apply its own conversion on top of this.`;

      // Re-render fresh each time this modal/tab opens so the amount always matches the
      // current cart (PayPal Buttons don't support updating an already-rendered amount).
      buttonContainer.innerHTML = '';
      paypal.Buttons({
        style: { layout: 'vertical', color: 'blue', shape: 'pill', label: 'paypal', height: 40 },
        createOrder: (data, actions) => {
          return actions.order.create({
            purchase_units: [{
              amount: { currency_code: 'USD', value: usdAmount },
              description: `Eugene Card order — ${cart.length} item(s)`
            }]
          });
        },
        onApprove: async (data, actions) => {
          statusEl.innerText = 'Payment approved — confirming your order…';
          statusEl.classList.remove('hidden');
          try {
            const details = await actions.order.capture();
            await finalizePaypalOrder(details, usdAmount, rate);
          } catch (e) {
            statusEl.innerText = 'Payment captured by PayPal, but we could not save your order automatically. Please contact admin with PayPal order ID: ' + (data.orderID || 'unknown') + ' — Error: ' + e.message;
          }
        },
        onError: (err) => {
          console.error('PayPal error:', err);
          statusEl.innerText = 'PayPal ran into an error. Please try again or use QRIS instead.';
          statusEl.classList.remove('hidden');
        },
        onCancel: () => {
          showToast('PayPal payment cancelled.');
        }
      }).render('#paypal-button-container');
    }

    async function finalizePaypalOrder(paypalDetails, usdAmount, rateUsed) {
      if (!currentUser) return showToast('Please log in.');
      if (cart.length === 0) return showToast('Your cart is empty.');

      const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
      const total = subtotal * 1.02;
      const orderRef = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      const activeUserIdent = currentUser.username || currentUser.name;

      const orderData = {
        id: orderRef,
        type: 'BUY',
        paymentMethod: 'PAYPAL',
        user_name: activeUserIdent,
        items: cart.map(i => ({ id: i.id, serial: i.serial, name: i.name, price: i.price })),
        subtotal: subtotal,
        tax: subtotal * 0.02,
        total_amount: total,
        status: 'APPROVED', // PayPal capture already confirmed the payment — no manual admin step
        paypalOrderId: paypalDetails.id || null,
        paypalPayerEmail: (paypalDetails.payer && paypalDetails.payer.email_address) || null,
        usdAmountCharged: Number(usdAmount),
        exchangeRateUsed: rateUsed,
        created_at: new Date().toISOString()
      };

      try {
        const batch = db.batch();
        batch.set(db.collection("transactions").doc(orderRef), orderData);
        cart.forEach(item => {
          batch.update(db.collection("cards").doc(item.id), { owner: activeUserIdent, status: 'SOLD' });
        });
        await batch.commit();

        cart = [];
        saveCartToStorage();
        updateCartTotals();

        closeCheckoutModal();
        showToast(`Order ${orderRef} paid via PayPal! Cards added to your Vault.`);
        addNotification('Order Paid', `Order ${orderRef} paid via PayPal and confirmed automatically.`, 'fa-circle-check text-sky-400');

        switchTab('history');
      } catch (e) {
        showToast('Order save error after payment: ' + e.message);
      }
    }

    function isUserAdmin(identifier) {
      if (!identifier) return false;
      const lower = identifier.toLowerCase().trim();
      return ADMIN_EMAILS.some(e => e.toLowerCase() === lower || e.split('@')[0].toLowerCase() === lower);
    }

    // ===== PROFILES <-> USERS SYNC =====
    // This app has always stored collector profile data (display name,
    // avatar, bio, socials) in a "profiles" collection keyed by email. A
    // separate, older "users" collection (keyed by Firebase Auth UID) also
    // holds profile-shaped data for some accounts, using different field
    // names (displayName instead of name, avatar instead of avatarUrl,
    // instagram/tiktok/website instead of socialIg/socialTiktok/socialWeb).
    // Nothing used to read that collection, so any collector whose data only
    // lived there (e.g. accounts created before "profiles" existed) showed up
    // as a raw username with a placeholder avatar in the Holders Directory,
    // vault pages, and the admin relink picker. These helpers translate
    // between the two shapes and keep both collections mirrored going
    // forward — "name" (profiles) and "displayName" (users) always carry the
    // same value.
    function mapUsersDocToProfileShape(u) {
      if (!u) return null;
      return {
        name: u.displayName || u.name || '',
        username: u.username || '',
        avatarUrl: u.avatar || u.avatarUrl || '',
        bio: u.bio || '',
        isPlusMember: !!u.isPlusMember,
        socialIg: u.instagram || u.socialIg || '',
        socialTwitter: u.twitter || u.socialTwitter || '',
        socialTiktok: u.tiktok || u.socialTiktok || '',
        socialWeb: u.website || u.socialWeb || '',
        profileCompleted: u.profileCompleted !== undefined ? !!u.profileCompleted : true
      };
    }

    // ===== CANONICAL COLLECTOR IDENTITY =====
    // Firebase Auth UID is the canonical identity. Display names/usernames are
    // mutable labels and must never create a second person when the same UID
    // exists in both the newer `profiles/{email}` collection and legacy
    // `users/{uid}` collection.
    function normalizeCollectorValue(value) {
      return String(value || '').trim().toLowerCase();
    }

    function collectorProfileMatches(a, b) {
      if (!a || !b) return false;
      if (a.uid && b.uid && a.uid === b.uid) return true;
      const au = normalizeCollectorValue(a.username);
      const bu = normalizeCollectorValue(b.username);
      if (au && bu && au === bu) return true;
      const an = normalizeCollectorValue(a.name);
      const bn = normalizeCollectorValue(b.name);
      // Only use display-name matching when one side has no authenticated UID.
      // Two authenticated accounts are allowed to share the same display name.
      if (an && bn && an === bn && (!a.uid || !b.uid)) return true;
      return false;
    }

    function mergeCollectorProfile(primary, secondary) {
      const merged = { ...(secondary || {}), ...(primary || {}) };
      // Prefer populated fields from either source without allowing legacy
      // placeholder/empty values to erase the real profile.
      ['name','username','avatarUrl','bio','socialIg','socialTwitter','socialTiktok','socialWeb'].forEach(field => {
        if (!normalizeCollectorValue(primary?.[field]) && secondary?.[field]) merged[field] = secondary[field];
      });
      if (!merged.uid && secondary?.uid) merged.uid = secondary.uid;
      if (primary?.profileCompleted !== undefined) merged.profileCompleted = !!primary.profileCompleted;
      else if (secondary?.profileCompleted !== undefined) merged.profileCompleted = !!secondary.profileCompleted;
      return merged;
    }

    function getCanonicalCollectorIdentity(identifier) {
      if (!identifier) return null;
      const raw = typeof identifier === 'object' ? identifier : { name: identifier, username: identifier };
      const key = normalizeCollectorValue(typeof identifier === 'object' ? (identifier.uid || identifier.username || identifier.name) : identifier);
      if (!key) return null;

      // UID is always the strongest match.
      if (raw.uid) {
        for (const p of Object.values(globalCollectorProfiles || {})) {
          if (p?.uid === raw.uid) return p;
        }
      }

      for (const p of Object.values(globalCollectorProfiles || {})) {
        if (!p) continue;
        if (normalizeCollectorValue(p.username) === key || normalizeCollectorValue(p.name) === key) return p;
        if (typeof identifier === 'string' && normalizeCollectorValue(p.uid) === key) return p;
      }
      return null;
    }

    function getCanonicalCollectorKey(identifier) {
      const p = getCanonicalCollectorIdentity(identifier);
      if (p?.uid) return `uid:${p.uid}`;
      if (p?.username) return `username:${normalizeCollectorValue(p.username)}`;
      if (p?.name) return `name:${normalizeCollectorValue(p.name)}`;
      return `raw:${normalizeCollectorValue(identifier)}`;
    }

    function mapProfileToUsersDocShape(p) {
      if (!p) return null;
      return {
        displayName: p.name || '',
        username: p.username || '',
        avatar: p.avatarUrl || '',
        bio: p.bio || '',
        instagram: p.socialIg || '',
        tiktok: p.socialTiktok || '',
        website: p.socialWeb || '',
        profileCompleted: !!p.profileCompleted
      };
    }

    // Best-effort mirror write to the legacy "users/{uid}" doc so anyone
    // still looking at that collection (or a not-yet-migrated part of the
    // app) sees the same name/avatar/bio/socials as "profiles". Never throws —
    // this is a secondary copy, not the source of truth.
    async function syncProfileToUsersDoc(uid, profilePayload) {
      if (!uid) return;
      try {
        await db.collection("users").doc(uid).set(mapProfileToUsersDocShape(profilePayload), { merge: true });
      } catch (e) {
        console.warn('Error mirroring profile to users collection:', e);
      }
    }

    // Rebuilds the public collector roster from both profile collections while
    // collapsing records that represent the same Firebase Auth account.
    // `profiles` is preferred because it contains the current profile fields;
    // `users/{uid}` is treated as a legacy mirror/fallback only.
    function rebuildGlobalCollectorProfiles() {
      const canonical = [];

      const addOrMerge = (candidate, sourceKey, preferCandidate = false) => {
        if (!candidate) return;
        const existingIndex = canonical.findIndex(existing => collectorProfileMatches(existing.profile, candidate));
        if (existingIndex >= 0) {
          const existing = canonical[existingIndex];
          existing.profile = preferCandidate
            ? mergeCollectorProfile(candidate, existing.profile)
            : mergeCollectorProfile(existing.profile, candidate);
          // Preserve the stable profile document key for callers that need it.
          if (existing.profile.uid == null && candidate.uid) existing.profile.uid = candidate.uid;
          return;
        }
        canonical.push({ sourceKey, profile: { ...candidate } });
      };

      // New profiles collection is the source of truth when both collections
      // contain the same collector.
      for (const [emailKey, rawProfile] of Object.entries(globalRawProfilesData || {})) {
        if (!rawProfile) continue;
        addOrMerge({ ...rawProfile }, emailKey, false);
      }

      // Legacy users are only added when they do not already represent an
      // existing collector. If their UID matches a profile, their missing fields
      // are merged into that profile instead of creating a second roster entry.
      for (const uid of Object.keys(globalRawUsersData || {})) {
        const mapped = mapUsersDocToProfileShape(globalRawUsersData[uid]);
        if (!mapped) continue;
        mapped.uid = uid;
        addOrMerge(mapped, uid, false);
      }

      globalCollectorProfiles = {};
      canonical.forEach(({ sourceKey, profile }) => {
        const stableKey = sourceKey || profile.uid || profile.username || profile.name;
        if (stableKey) globalCollectorProfiles[stableKey] = profile;
      });
    }

    // BUGFIX: this used to swallow a failed "profiles" fetch and leave
    // globalRawProfilesData looking exactly like "this collector has no
    // profile yet" (an empty object, same as a real first-time signup).
    // On a brand-new device with no localStorage/cookie cache to fall back
    // on, handleUserSession() would then compute fresh default name/avatar/
    // bio values AND persist them back to Firestore with merge:true — which
    // silently overwrote the collector's real profile, since the payload
    // includes exactly those fields. That's what made a profile "change
    // completely" on another device: a transient read failure (e.g. the
    // Firestore auth token not being ready yet on a fresh sign-in) got
    // permanently written over the real data. profilesFetchFailed lets
    // callers tell "genuinely no profile" apart from "couldn't check", so
    // they can skip writing anything back in the second case.
    let profilesFetchFailed = false;

    async function loadCollectorProfiles() {
      profilesFetchFailed = false;
      try {
        const snapshot = await db.collection("profiles").get();
        globalRawProfilesData = {};
        snapshot.forEach(doc => {
          globalRawProfilesData[doc.id] = doc.data();
        });
      } catch (e) {
        console.warn('Error loading collector profiles:', e);
        profilesFetchFailed = true;
      }
      try {
        const usersSnapshot = await db.collection("users").get();
        globalRawUsersData = {};
        usersSnapshot.forEach(doc => {
          globalRawUsersData[doc.id] = doc.data();
        });
      } catch (e) {
        console.warn('Error loading legacy user profiles:', e);
      }
      rebuildGlobalCollectorProfiles();
    }

    function getCollectorProfile(nameOrUsername) {
      if (!nameOrUsername) return null;
      const key = nameOrUsername.toLowerCase().trim();
      
      for (let emailKey in globalCollectorProfiles) {
        const p = globalCollectorProfiles[emailKey];
        if (p.uid === nameOrUsername || p.name?.toLowerCase() === key || p.username?.toLowerCase() === key || emailKey.toLowerCase() === key) {
          return p;
        }
      }

      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith('profile_')) {
            const val = JSON.parse(localStorage.getItem(k));
            if (val.name?.toLowerCase() === key || val.username?.toLowerCase() === key) {
              return val;
            }
          }
        }
      } catch (e) {}

      return null;
    }

    function getCollectorProfileKey(nameOrUsername) {
      // Like getCollectorProfile, but returns the matching Firestore doc ID
      // (the "profiles" collection key) instead of the profile data itself,
      // so admin edits update the existing doc rather than creating a duplicate.
      if (!nameOrUsername) return null;
      const key = nameOrUsername.toLowerCase().trim();

      for (let emailKey in globalCollectorProfiles) {
        const p = globalCollectorProfiles[emailKey];
        if (p.uid === nameOrUsername || p.name?.toLowerCase() === key || p.username?.toLowerCase() === key || emailKey.toLowerCase() === key) {
          return emailKey;
        }
      }
      return null;
    }

    function getCollectorAvatar(nameOrUsername) {
      if (!nameOrUsername) return null;
      const profile = getCollectorProfile(nameOrUsername);
      if (profile && profile.avatarUrl) {
        return profile.avatarUrl;
      }

      const key = nameOrUsername.toLowerCase().trim();
      if (isUserAdmin(nameOrUsername)) {
        return `https://api.dicebear.com/7.x/identicon/svg?seed=admin_${key}`;
      }

      return `https://api.dicebear.com/7.x/identicon/svg?seed=${key}`;
    }

    async function switchAccountPersona(personaName) {
      if (!currentUser) return;
      
      const newUsername = personaName.toLowerCase().replace(/\s+/g, '_');
      
      let isTaken = false;
      for (let emailKey in globalCollectorProfiles) {
        if (emailKey !== currentUser.email) {
          const p = globalCollectorProfiles[emailKey];
          if (p.username?.toLowerCase() === newUsername) {
            isTaken = true;
            break;
          }
        }
      }

      if (isTaken) {
        return showToast(`Username @${newUsername} is already taken by another account.`);
      }

      currentUser.name = personaName;
      currentUser.username = newUsername;
      // SECURITY FIX (item 5): admin status must never be derived from a user-editable
      // display name — only from the verified authenticated account email. Previously
      // this line also checked isUserAdmin(personaName), which meant any logged-in user
      // could rename themselves to an admin-matching string (e.g. "Admin House", which is
      // literally in ADMIN_EMAILS) and grant themselves full admin UI/actions client-side.
      currentUser.isAdmin = isUserAdmin(currentUser.email);
      currentUser.isPlusMember = false;

      const profilePayload = { name: personaName, username: currentUser.username, avatarUrl: currentUser.avatarUrl, bio: currentUser.bio, isPlusMember: false, socialIg: currentUser.socialIg, socialTwitter: currentUser.socialTwitter, socialTiktok: currentUser.socialTiktok, socialWeb: currentUser.socialWeb, uid: currentUser.uid || null };
      localStorage.setItem(`profile_${currentUser.email}`, JSON.stringify(profilePayload));
      setCookie(`profile_${currentUser.email}`, profilePayload, 30);

      try {
        await db.collection("profiles").doc(currentUser.email).set(profilePayload, { merge: true });
        await syncProfileToUsersDoc(currentUser.uid, profilePayload);
        await loadCollectorProfiles();
      renderCollectorReputationPanel();
      } catch (e) {}

      renderAuthHeader();
      updateAllViews();
      closeProfileManagerModal();
      showToast(`Switched active persona to: ${personaName}`);
    }

    function setCookie(name, value, days = 30) {
      try {
        const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
        document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : value)}; expires=${expires}; path=/; SameSite=Lax`;
      } catch (e) { console.warn('Cookie set exception:', e); }
    }

    function getCookie(name) {
      try {
        const encodedName = encodeURIComponent(name);
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
          const [key, val] = cookie.trim().split('=');
          if (key === encodedName && val) {
            const decoded = decodeURIComponent(val);
            try { return JSON.parse(decoded); } catch (e) { return decoded; }
          }
        }
      } catch (e) { console.warn('Cookie parse exception:', e); }
      return null;
    }

    function deleteCookie(name) {
      document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }

    function loadNotifications() {
      try {
        const savedLocal = localStorage.getItem('eugene_notifications');
        const savedCookie = getCookie('eugene_notifications');
        systemNotifications = savedLocal ? JSON.parse(savedLocal) : (savedCookie || []);
      } catch (e) { systemNotifications = []; }
      renderNotifications();
    }

    function addNotification(title, message, iconClass = 'fa-info-circle text-indigo-400') {
      const newNotif = {
        id: 'notif-' + Date.now(),
        title,
        message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        iconClass
      };
      systemNotifications.unshift(newNotif);
      if (systemNotifications.length > 20) systemNotifications.pop();
      try {
        localStorage.setItem('eugene_notifications', JSON.stringify(systemNotifications));
        setCookie('eugene_notifications', systemNotifications, 7);
      } catch (e) {}
      renderNotifications();
    }

    function renderNotifications() {
      const badge = document.getElementById('notification-badge');
      const list = document.getElementById('notification-list');
      
      if (badge) badge.innerText = systemNotifications.length;
      if (!list) return;

      if (systemNotifications.length === 0) {
        list.innerHTML = `<div class="p-6 text-center text-xs text-slate-500" data-i18n="noNotifications">${i18nDict[currentLanguage].noNotifications}</div>`;
        return;
      }

      list.innerHTML = systemNotifications.map(n => `
        <div class="p-3 hover:bg-slate-950/85 transition-colors flex items-start gap-3 text-xs">
          <div class="mt-0.5 p-2 rounded-xl bg-slate-950 border border-slate-800"><i class="fa-solid ${n.iconClass}"></i></div>
          <div class="flex-1 space-y-0.5">
            <div class="flex justify-between items-center">
              <span class="font-extrabold text-white text-[11px]">${n.title}</span>
              <span class="text-[9px] font-mono text-slate-500">${n.time}</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-snug">${n.message}</p>
          </div>
        </div>
      `).join('');
    }

    function toggleNotificationMenu() {
      const dropdown = document.getElementById('notification-dropdown');
      if (dropdown) dropdown.classList.toggle('hidden');
    }

    function clearNotifications() {
      systemNotifications = [];
      localStorage.removeItem('eugene_notifications');
      deleteCookie('eugene_notifications');
      renderNotifications();
      showToast('Notifications cleared.');
    }

    function getChatIdentityProfile(identifier) {
      if (!identifier) return null;
      const profile = getCanonicalCollectorIdentity(identifier);
      if (profile) return profile;
      if (typeof identifier === 'object') return identifier;
      return { name: identifier, username: identifier, avatarUrl: getCollectorAvatar(identifier) };
    }

    function getChatIdentityTokens(identifier) {
      const p = getChatIdentityProfile(identifier) || {};
      const raw = typeof identifier === 'string' ? identifier : '';
      return [...new Set([
        p.uid,
        p.username,
        p.name,
        raw,
        typeof identifier === 'object' ? identifier.email : ''
      ].map(normalizeCollectorValue).filter(Boolean))];
    }

    function getChatCanonicalKey(identifier) {
      const p = getChatIdentityProfile(identifier);
      if (p?.uid) return `uid:${p.uid}`;
      return getCanonicalCollectorKey(identifier);
    }

    function getCurrentChatIdentity() {
      return currentUser ? getChatIdentityProfile(currentUser) : null;
    }

    function getChatDisplayName(identifier) {
      const p = getChatIdentityProfile(identifier);
      return p?.name || p?.username || (typeof identifier === 'string' ? identifier : 'Collector');
    }

    function formatChatUpdatedAt(value) {
      if (!value) return 'No recent activity';
      try {
        const date = value.toDate ? value.toDate() : new Date(value);
        if (Number.isNaN(date.getTime())) return 'No recent activity';
        const diff = Date.now() - date.getTime();
        if (diff < 60 * 1000) return 'Just now';
        if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}d ago`;
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } catch (e) { return 'No recent activity'; }
    }

    function isChatThreadUnread(thread) {
      if (!currentUser) return false;
      const lastSenderTokens = getChatIdentityTokens({ uid: thread.lastSenderUid, username: thread.lastSenderUsername, name: thread.lastSender });
      const myTokens = getChatIdentityTokens(currentUser);
      if (!thread.lastSender && !thread.lastSenderUid) return false;
      if (lastSenderTokens.some(t => myTokens.includes(t))) return false;
      const readBy = Array.isArray(thread.readBy) ? thread.readBy.map(normalizeCollectorValue).filter(Boolean) : [];
      return !myTokens.some(t => readBy.includes(t));
    }

    function updateInboxUnreadBadge(count = null) {
      const total = count === null ? inboxThreadsCache.filter(isChatThreadUnread).length : Math.max(0, Number(count) || 0);
      const badge = document.getElementById('inbox-unread-badge');
      if (badge) {
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.classList.toggle('hidden', total === 0);
      }
      const stat = document.getElementById('inbox-stat-unread');
      if (stat) stat.textContent = String(total);
      const filter = document.getElementById('inbox-filter-unread-count');
      if (filter) filter.textContent = String(total);
      return total;
    }

    function openNewChatModal() {
      if (!currentUser) return showToast('Please log in to start a chat.');
      const modal = document.getElementById('new-chat-modal');
      if (!modal) return;
      modal.classList.remove('hidden'); modal.classList.add('flex');
      const input = document.getElementById('user-chat-search-input');
      if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
      const results = document.getElementById('user-chat-search-results');
      if (results) { results.innerHTML = ''; results.classList.add('hidden'); }
    }

    function closeNewChatModal() {
      const modal = document.getElementById('new-chat-modal');
      if (!modal) return;
      modal.classList.add('hidden'); modal.classList.remove('flex');
    }

    function setInboxFilter(filter) {
      inboxFilter = ['ALL','UNREAD','ADMIN','PINNED'].includes(filter) ? filter : 'ALL';
      ['ALL','UNREAD','ADMIN','PINNED'].forEach(f => {
        const el = document.getElementById(`inbox-filter-${f}`);
        if (!el) return;
        const active = f === inboxFilter;
        el.className = active
          ? 'inbox-filter active'
          : 'inbox-filter';
      });
      renderInboxThreads();
    }

    function setInboxSearch(value) {
      inboxSearchQuery = normalizeCollectorValue(value);
      renderInboxThreads();
    }

    function toggleInboxPin(chatId) {
      if (!chatId) return;
      if (inboxPinnedThreads.has(chatId)) inboxPinnedThreads.delete(chatId);
      else inboxPinnedThreads.add(chatId);
      localStorage.setItem('eugene_inbox_pinned', JSON.stringify([...inboxPinnedThreads]));
      renderInboxThreads();
    }

    async function markInboxThreadRead(thread) {
      if (!thread?.id || !currentUser) return;
      const tokens = getChatIdentityTokens(currentUser);
      try {
        await db.collection('chats').doc(thread.id).set({
          readBy: firebase.firestore.FieldValue.arrayUnion(...tokens)
        }, { merge: true });
      } catch (e) { console.warn('Could not mark chat read:', e); }
    }

    async function markAllInboxRead() {
      if (!currentUser || !inboxThreadsCache.length) return;
      const unread = inboxThreadsCache.filter(isChatThreadUnread);
      if (!unread.length) return showToast('Inbox is already up to date.');
      try {
        const batch = db.batch();
        const tokens = getChatIdentityTokens(currentUser);
        unread.forEach(t => batch.set(db.collection('chats').doc(t.id), { readBy: firebase.firestore.FieldValue.arrayUnion(...tokens) }, { merge: true }));
        await batch.commit();
        showToast(`Marked ${unread.length} conversation${unread.length === 1 ? '' : 's'} as read.`);
      } catch (e) { showToast('Could not mark conversations as read: ' + e.message); }
    }

    function renderInboxThreads() {
      const container = document.getElementById('inbox-threads-list');
      if (!container) return;
      const query = inboxSearchQuery;
      let list = inboxThreadsCache.filter(t => {
        const unread = isChatThreadUnread(t);
        if (inboxFilter === 'UNREAD' && !unread) return false;
        if (inboxFilter === 'ADMIN' && !t.isOtherAdmin) return false;
        if (inboxFilter === 'PINNED' && !inboxPinnedThreads.has(t.id)) return false;
        if (query) {
          const haystack = [t.otherUser, t.otherUsername, t.lastMessage, t.otherUid].map(normalizeCollectorValue).join(' ');
          if (!haystack.includes(query)) return false;
        }
        return true;
      });

      list.sort((a,b) => {
        const ap = inboxPinnedThreads.has(a.id) ? 1 : 0;
        const bp = inboxPinnedThreads.has(b.id) ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const au = isChatThreadUnread(a) ? 1 : 0;
        const bu = isChatThreadUnread(b) ? 1 : 0;
        if (au !== bu) return bu - au;
        const at = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : new Date(a.updatedAt || 0).getTime();
        const bt = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : new Date(b.updatedAt || 0).getTime();
        return bt - at;
      });

      const unreadTotal = inboxThreadsCache.filter(isChatThreadUnread).length;
      const pinnedTotal = inboxThreadsCache.filter(t => inboxPinnedThreads.has(t.id)).length;
      const supportTotal = inboxThreadsCache.filter(t => t.isOtherAdmin).length;
      const countEl = document.getElementById('inbox-thread-count');
      const summaryEl = document.getElementById('inbox-unread-summary');
      if (countEl) countEl.textContent = String(inboxThreadsCache.length);
      if (summaryEl) summaryEl.textContent = unreadTotal ? `${unreadTotal} unread` : 'All caught up';
      const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
      setText('inbox-stat-total', inboxThreadsCache.length);
      setText('inbox-stat-unread', unreadTotal);
      setText('inbox-stat-pinned', pinnedTotal);
      setText('inbox-stat-support', supportTotal);
      setText('inbox-filter-all-count', inboxThreadsCache.length);
      setText('inbox-filter-unread-count', unreadTotal);
      setText('inbox-filter-admin-count', supportTotal);
      setText('inbox-filter-pinned-count', pinnedTotal);
      updateInboxUnreadBadge(unreadTotal);

      if (!list.length) {
        const title = inboxFilter === 'UNREAD' ? 'No unread conversations.' : (inboxFilter === 'PINNED' ? 'No pinned conversations.' : (query ? 'No conversations match your search.' : 'No active chat threads found.'));
        container.innerHTML = `<div class="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-10 text-center"><div class="w-11 h-11 mx-auto rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 mb-3"><i class="fa-solid fa-inbox"></i></div><p class="text-xs text-slate-500">${title}</p></div>`;
        return;
      }

      container.innerHTML = list.map(t => {
        const unread = isChatThreadUnread(t);
        const pinned = inboxPinnedThreads.has(t.id);
        const admin = !!t.isOtherAdmin;
        const avatar = t.otherAvatar || getCollectorAvatar(t.otherUser);
        const display = escapeHtml(t.otherUser || 'Collector');
        const username = t.otherUsername ? `@${escapeHtml(t.otherUsername)}` : '';
        const preview = escapeHtml(t.lastMessage || 'Click to view conversation');
        const time = formatChatUpdatedAt(t.updatedAt);
        const online = t.otherUid && userPresenceMap[t.otherUid] && userPresenceMap[t.otherUid].lastSeen;
        const onlineAt = online && userPresenceMap[t.otherUid].lastSeen?.toMillis ? userPresenceMap[t.otherUid].lastSeen.toMillis() : 0;
        const isOnline = !!onlineAt && (Date.now() - onlineAt <= PRESENCE_ACTIVE_WINDOW_MS);
        return `
          <div class="inbox-thread-card ${admin ? 'border-rose-500/30' : ''} ${unread ? 'is-unread' : ''} ${inboxPinnedThreads.has(t.id) ? 'is-pinned' : ''}">
            <div class="flex items-center gap-3">
              <button onclick="toggleInboxPin('${escapeHtml(t.id)}')" class="shrink-0 w-7 h-7 rounded-lg bg-slate-950/80 border border-slate-800 text-[10px] ${pinned ? 'text-amber-400 border-amber-500/30' : 'text-slate-600 hover:text-amber-400'}" title="${pinned ? 'Unpin' : 'Pin'} conversation"><i class="fa-solid fa-thumbtack"></i></button>
              <div class="relative shrink-0">
                <img src="${escapeHtml(avatar)}" class="w-11 h-11 rounded-full object-cover border ${admin ? 'border-rose-500/40' : 'border-slate-700'} bg-slate-950">
                ${isOnline ? '<span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900"></span>' : ''}
                ${unread ? '<span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-indigo-500 border-2 border-slate-900"></span>' : ''}
              </div>
              <button onclick="openDirectChatByThreadId('${escapeHtml(t.id)}')" class="min-w-0 flex-1 text-left">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-extrabold ${unread ? 'text-white' : 'text-slate-200'} text-sm">${display}</span>
                  ${username ? `<span class="text-[10px] text-slate-500 font-mono">${username}</span>` : ''}
                  ${admin ? '<span class="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30"><i class="fa-solid fa-shield-halved mr-0.5"></i> ADMIN</span>' : ''}
                  ${unread ? '<span class="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">NEW</span>' : ''}
                </div>
                <div class="flex items-center gap-2 mt-0.5">
                  <p class="text-[11px] ${unread ? 'text-slate-200 font-semibold' : 'text-slate-400'} truncate">${preview}</p>
                  <span class="text-[9px] text-slate-600 shrink-0">${escapeHtml(time)}</span>
                </div>
              </button>
              <button onclick="openDirectChatByThreadId('${escapeHtml(t.id)}')" class="px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] rounded-xl transition-all shadow shrink-0 flex items-center gap-1.5"><i class="fa-solid fa-comments"></i><span class="hidden sm:inline">Chat</span></button>
            </div>
          </div>`;
      }).join('');
    }

    function searchUsersForChat() {
      const query = normalizeCollectorValue(document.getElementById('user-chat-search-input')?.value || '');
      const resultsContainer = document.getElementById('user-chat-search-results');
      if (!resultsContainer) return;
      if (!query) { resultsContainer.classList.add('hidden'); resultsContainer.innerHTML = ''; return; }

      const found = new Map();
      Object.values(globalCollectorProfiles || {}).forEach(p => {
        if (!p || !p.uid) return;
        const hay = [p.name, p.username, p.email, p.uid].map(normalizeCollectorValue).join(' ');
        if (!hay.includes(query)) return;
        const key = `uid:${p.uid}`;
        if (!found.has(key)) found.set(key, p);
      });
      ADMIN_EMAILS.forEach(email => {
        const name = email.split('@')[0];
        if (normalizeCollectorValue(email).includes(query) || normalizeCollectorValue(name).includes(query)) {
          found.set(`admin:${normalizeCollectorValue(email)}`, { name, username: name, email, isAdmin: true });
        }
      });

      const meKey = getChatCanonicalKey(currentUser);
      const results = [...found.values()].filter(p => getChatCanonicalKey(p) !== meKey);
      results.sort((a,b) => (a.isAdmin ? -1 : 0) - (b.isAdmin ? -1 : 0) || (a.name || a.username || '').localeCompare(b.name || b.username || ''));

      if (!results.length) {
        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = `<div class="p-3 text-center text-slate-500 text-xs bg-slate-950 rounded-xl border border-slate-800">No matching collectors found for "${escapeHtml(query)}"</div>`;
        return;
      }
      resultsContainer.classList.remove('hidden');
      resultsContainer.innerHTML = results.slice(0, 12).map(p => {
        const name = escapeHtml(p.name || p.username || 'Collector');
        const username = p.username ? `@${escapeHtml(p.username)}` : '';
        const avatar = escapeHtml(p.avatarUrl || getCollectorAvatar(p.username || p.name));
        const admin = !!p.isAdmin || isUserAdmin(p.username || p.name || p.email);
        return `<button onclick="openDirectChatByIdentity('${escapeHtml(p.uid || p.username || p.name)}'); document.getElementById('user-chat-search-results').classList.add('hidden'); closeNewChatModal();" class="w-full p-3 bg-slate-950 hover:bg-slate-800 border ${admin ? 'border-rose-500/40' : 'border-slate-800'} rounded-xl flex items-center justify-between text-left cursor-pointer transition-all">
          <span class="flex items-center gap-2.5 min-w-0"><img src="${avatar}" class="w-8 h-8 rounded-full object-cover border border-slate-700 bg-slate-900"><span class="min-w-0"><span class="flex items-center gap-1.5"><span class="font-extrabold text-white text-xs truncate">${name}</span>${admin ? '<span class="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">ADMIN</span>' : ''}</span><span class="text-[10px] text-slate-500 truncate">${username || (p.uid ? 'Verified collector account' : 'Platform support')}</span></span></span>
          <span class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded-lg shrink-0"><i class="fa-solid fa-comments"></i> Start</span>
        </button>`;
      }).join('');
    }

    async function findExistingChatIdForParticipants(a, b) {
      const keyA = getChatCanonicalKey(a);
      const keyB = getChatCanonicalKey(b);
      try {
        const snapshot = await db.collection('chats').get();
        let best = null;
        snapshot.forEach(doc => {
          const d = doc.data() || {};
          const participants = Array.isArray(d.participants) ? d.participants : doc.id.replace(/^chat-/, '').split('-vs-');
          if (participants.length < 2) return;
          const keys = participants.slice(0, 2).map(getChatCanonicalKey);
          if (keys.includes(keyA) && keys.includes(keyB)) {
            const ts = d.updatedAt?.toMillis ? d.updatedAt.toMillis() : 0;
            if (!best || ts > best.ts) best = { id: doc.id, ts };
          }
        });
        return best?.id || null;
      } catch (e) { return null; }
    }

    async function openDirectChatByIdentity(identifier, contextInfo = 'Direct Collector Chat') {
      const profile = getChatIdentityProfile(identifier);
      return openDirectChat(profile?.username || profile?.name || identifier, contextInfo, profile);
    }

    async function openDirectChatByThreadId(threadId) {
      const thread = inboxThreadsCache.find(t => t.id === threadId);
      if (!thread) return;
      await markInboxThreadRead(thread);
      // IMPORTANT: open the exact thread selected from the inbox.
      // Do not re-resolve it by participant identity because legacy username chats
      // and newer UID chats can coexist and contain different message histories.
      return openDirectChat(
        thread.otherUser,
        'Direct Chat',
        getChatIdentityProfile({ uid: thread.otherUid, username: thread.otherUsername, name: thread.otherUser }),
        thread.id
      );
    }

    async function openDirectChat(targetUserName, contextInfo = 'Trade Chat', resolvedProfile = null, forcedThreadId = null) {
      if (!currentUser) return showToast('Please log in to start a chat.');
      const targetProfile = resolvedProfile || getChatIdentityProfile(targetUserName);
      const targetDisplay = getChatDisplayName(targetProfile || targetUserName);
      const myKey = getChatCanonicalKey(currentUser);
      const targetKey = getChatCanonicalKey(targetProfile || targetUserName);
      if (myKey === targetKey && !currentUser.isAdmin) return showToast('Cannot chat with yourself.');

      currentChatTargetUser = targetDisplay;
      const cachedMatch = inboxThreadsCache.find(t => t.otherKey === targetKey);
      // A thread selected from Inbox must always win over identity-based lookup.
      // This prevents opening a different/empty legacy chat when multiple chat IDs
      // exist for the same collector.
      const existingId = forcedThreadId || cachedMatch?.id || await findExistingChatIdForParticipants(currentUser, targetProfile || targetUserName);
      if (existingId) {
        currentChatContextId = existingId;
      } else {
        const ids = [myKey, targetKey].sort();
        currentChatContextId = `chat-${ids.join('-vs-')}`;
      }

      const myTokens = getChatIdentityTokens(currentUser);
      db.collection('chats').doc(currentChatContextId).set({
        participantUids: [currentUser.uid || null, targetProfile?.uid || null].filter(Boolean),
        participantKeys: [myKey, targetKey],
        participantProfiles: {
          [myKey]: { uid: currentUser.uid || null, name: currentUser.name || currentUser.username || '', username: currentUser.username || '' },
          [targetKey]: { uid: targetProfile?.uid || null, name: targetDisplay, username: targetProfile?.username || '' }
        },
        readBy: firebase.firestore.FieldValue.arrayUnion(...myTokens)
      }, { merge: true }).catch(() => {});

      document.getElementById('chat-target-user-name').innerText = targetDisplay;
      document.getElementById('chat-target-context').innerText = contextInfo;
      const targetAvatarUrl = targetProfile?.avatarUrl || getCollectorAvatar(targetDisplay);
      const avatarContainer = document.getElementById('chat-target-avatar-container');
      if (avatarContainer) avatarContainer.innerHTML = `<img src="${escapeHtml(targetAvatarUrl)}" class="w-full h-full object-cover">`;
      const adminBadgeEl = document.getElementById('chat-target-admin-badge');
      if (adminBadgeEl) adminBadgeEl.classList.toggle('hidden', !isUserAdmin(targetDisplay));
      document.getElementById('chat-drawer').classList.remove('translate-x-full');
      document.getElementById('chat-drawer-overlay').classList.remove('hidden');
      document.body.classList.add('chat-drawer-open');
      requestAnimationFrame(() => {
        const chatInput = document.getElementById('chat-text-input');
        if (chatInput) chatInput.focus({ preventScroll: true });
      });
      const activeThread = inboxThreadsCache.find(t => t.id === currentChatContextId);
      if (activeThread) markInboxThreadRead(activeThread);
      listenToChatMessages(currentChatContextId);
    }

    function closeChatDrawer() {
      document.getElementById('chat-drawer').classList.add('translate-x-full');
      document.getElementById('chat-drawer-overlay').classList.add('hidden');
      document.body.classList.remove('chat-drawer-open');
      if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
      }
      clearChatImageAttachment();
    }

    function handleChatImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      if (file.size > 2 * 1024 * 1024) {
        showToast('Image screenshot must be smaller than 2MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        chatAttachedImage = e.target.result;
        document.getElementById('chat-image-preview-img').src = e.target.result;
        document.getElementById('chat-image-preview-box').classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }

    function clearChatImageAttachment() {
      chatAttachedImage = null;
      const fileInput = document.getElementById('chat-file-input');
      if (fileInput) fileInput.value = '';
      document.getElementById('chat-image-preview-img').src = '';
      document.getElementById('chat-image-preview-box').classList.add('hidden');
    }

    function listenToChatMessages(chatId) {
      const container = document.getElementById('chat-messages-container');
      if (!container || !chatId) return;
      if (chatUnsubscribe) chatUnsubscribe();

      // Do NOT use Firestore orderBy(timestamp) here. Legacy messages can have a
      // missing/different timestamp field, and Firestore excludes those documents
      // from an ordered query. That was the main cause of missing chat history.
      chatUnsubscribe = db.collection('chats').doc(chatId).collection('messages').onSnapshot(snapshot => {
        if (snapshot.empty) {
          container.innerHTML = `<div class="flex flex-col items-center justify-center h-full min-h-[300px] text-center"><div class="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-400/15 flex items-center justify-center mb-4"><i class="fa-regular fa-comments text-xl text-violet-300"></i></div><p class="text-sm font-black text-slate-300">${tr("startConversation","Start the conversation")}</p><p class="text-[10px] text-slate-600 mt-1">${tr("sendMessageOrScreenshot","Send a message or share a card screenshot.")}</p></div>`;
          return;
        }

        const docs = [...snapshot.docs].sort((a, b) => {
          const ma = a.data() || {};
          const mb = b.data() || {};
          const toMs = value => {
            try {
              if (!value) return 0;
              if (typeof value.toMillis === 'function') return value.toMillis();
              if (typeof value.toDate === 'function') return value.toDate().getTime();
              const parsed = new Date(value).getTime();
              return Number.isFinite(parsed) ? parsed : 0;
            } catch (_) { return 0; }
          };
          const ta = toMs(ma.timestamp || ma.createdAt || ma.sentAt);
          const tb = toMs(mb.timestamp || mb.createdAt || mb.sentAt);
          if (ta !== tb) return ta - tb;
          return String(a.id).localeCompare(String(b.id));
        });

        let lastDateKey=null;
        container.innerHTML=docs.map(doc=>{
          const msg=doc.data()||{};
          const senderProfile=getChatIdentityProfile({uid:msg.senderUid,username:msg.senderUsername,name:msg.senderName||msg.sender});
          const senderKey=getChatCanonicalKey(senderProfile||msg.sender);
          const isMe=currentUser&&senderKey===getChatCanonicalKey(currentUser);
          const senderName=senderProfile?.name||senderProfile?.username||msg.sender||'Collector';
          const isSenderAdmin=isUserAdmin(senderProfile?.username||senderName||msg.sender);
          const senderAvatar=senderProfile?.avatarUrl||getCollectorAvatar(senderName);
          const rawTs=msg.timestamp||msg.createdAt||msg.sentAt||null; const ts=rawTs?.toDate?rawTs.toDate():(rawTs?new Date(rawTs):null);
          const timestamp=ts&&!isNaN(ts)?ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'';
          const dateKey=ts&&!isNaN(ts)?ts.toLocaleDateString([], {year:'numeric',month:'short',day:'numeric'}):'Today';
          let dateDivider=''; if(dateKey!==lastDateKey){lastDateKey=dateKey;dateDivider=`<div class="eugene-chat-date">${escapeHtml(dateKey)}</div>`;}
          const image=msg.imgUrl?`<a href="${escapeHtml(msg.imgUrl)}" target="_blank" rel="noopener" class="block mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/20"><img src="${escapeHtml(msg.imgUrl)}" class="max-w-full max-h-72 w-auto object-contain mx-auto hover:scale-[1.015] transition-transform" loading="lazy"></a>`:'';
          const text=msg.text?`<div class="whitespace-pre-wrap break-words">${escapeHtml(msg.text)}</div>`:'';
          return `${dateDivider}<div class="flex ${isMe?'justify-end':'justify-start'} items-end gap-2">${!isMe?`<img src="${escapeHtml(senderAvatar)}" class="eugene-chat-avatar shrink-0" title="${escapeHtml(senderName)}">`:''}<div class="flex flex-col ${isMe?'items-end':'items-start'}"><div class="eugene-chat-meta ${isMe?'justify-end':''}">${isMe?'':`<span class="text-[9px] font-black text-slate-400">${escapeHtml(senderName)}</span>`}${isSenderAdmin?'<span class="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-400/20">ADMIN</span>':''}${timestamp?`<span class="eugene-chat-time">${escapeHtml(timestamp)}</span>`:''}</div><div class="eugene-chat-bubble ${isMe?'mine':'theirs'}">${image}${text}${isMe?'<div class="mt-1 text-right text-[8px] text-violet-200/60"><i class="fa-solid fa-check-double"></i></div>':''}</div></div></div>`;
        }).join('');
        requestAnimationFrame(()=>container.scrollTo({top:container.scrollHeight,behavior:'smooth'}));
      },err=>console.warn('Chat message listener error:',err));
    }

    async function sendChatMessage() {
      const input = document.getElementById('chat-text-input');
      const text = input ? input.value.trim() : '';
      if ((!text && !chatAttachedImage) || !currentChatContextId || !currentUser) return;
      try {
        const batch = db.batch();
        const chatDocRef = db.collection('chats').doc(currentChatContextId);
        const targetProfile = getChatIdentityProfile(currentChatTargetUser);
        const myKey = getChatCanonicalKey(currentUser);
        const targetKey = getChatCanonicalKey(targetProfile || currentChatTargetUser);
        const myTokens = getChatIdentityTokens(currentUser);
        batch.set(chatDocRef, {
          lastMessage: text || (chatAttachedImage ? '[Screenshot / Image]' : ''),
          lastSender: currentUser.username || currentUser.name,
          lastSenderUid: currentUser.uid || null,
          lastSenderUsername: currentUser.username || '',
          lastSenderName: currentUser.name || '',
          participants: [currentUser.username || currentUser.name, currentChatTargetUser].map(p => String(p || '').toLowerCase()),
          participantUids: [currentUser.uid || null, targetProfile?.uid || null].filter(Boolean),
          participantKeys: [myKey, targetKey],
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
          participantKeys: [myKey, targetKey],
          participantProfiles: {
            [myKey]: { uid: currentUser.uid || null, name: currentUser.name || currentUser.username || '', username: currentUser.username || '', avatarUrl: currentUser.avatarUrl || '' },
            [targetKey]: { uid: targetProfile?.uid || null, name: targetProfile?.name || targetProfile?.username || currentChatTargetUser || '', username: targetProfile?.username || '', avatarUrl: targetProfile?.avatarUrl || '' }
          },
          readBy: myTokens
        }, { merge: true });

        const msgDocRef = chatDocRef.collection('messages').doc();
        const payload = {
          sender: currentUser.username || currentUser.name,
          senderUid: currentUser.uid || null,
          senderUsername: currentUser.username || '',
          senderName: currentUser.name || '',
          text: text,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (chatAttachedImage) payload.imgUrl = chatAttachedImage;
        batch.set(msgDocRef, payload);
        await batch.commit();
        input.value = '';
        clearChatImageAttachment();
      } catch (e) {
        showToast('Error sending chat message: ' + e.message);
      }
    }

    function loadUserInboxThreads() {
      const container = document.getElementById('inbox-threads-list');
      if (!container) return;
      if (!currentUser) {
        container.innerHTML = `<div class="text-center py-10 text-slate-500 text-xs">Please log in to view your inbox.</div>`;
        updateInboxUnreadBadge(0);
        return;
      }
      if (inboxUnsubscribe) inboxUnsubscribe();

      inboxUnsubscribe = db.collection('chats').onSnapshot(async snapshot => {
        const myKey = getChatCanonicalKey(currentUser);
        const myTokens = getChatIdentityTokens(currentUser);
        const candidates = [];

        snapshot.forEach(doc => {
          const data = doc.data() || {};
          const rawParticipants = Array.isArray(data.participants) ? data.participants : [];
          const rawKeys = Array.isArray(data.participantKeys) ? data.participantKeys : [];
          const rawUids = Array.isArray(data.participantUids) ? data.participantUids : [];

          // Prefer canonical participantKeys/Uids written by the newer chat system.
          // Fall back to legacy participants or the chat id for older conversations.
          const participantKeys = rawKeys.length >= 2
            ? rawKeys.map(getChatCanonicalKey)
            : rawParticipants.map(getChatCanonicalKey);
          const fallbackParticipants = rawParticipants.length >= 2
            ? rawParticipants
            : doc.id.replace(/^chat-/, '').split('-vs-');
          const fallbackKeys = fallbackParticipants.map(getChatCanonicalKey);

          const allKeys = [...participantKeys, ...fallbackKeys];
          const isMine = allKeys.includes(myKey) || myTokens.some(t => allKeys.includes(`username:${t}`) || allKeys.includes(`name:${t}`) || allKeys.includes(`raw:${t}`));
          const isAdminVisible = !!currentUser.isAdmin;
          if (!isAdminVisible && !isMine) return;

          // Determine the other participant from the best available source.
          let otherKey = null, otherIndex = -1;
          if (participantKeys.length >= 2) {
            otherIndex = participantKeys.findIndex(k => k !== myKey);
            if (otherIndex >= 0) otherKey = participantKeys[otherIndex];
          }
          if (otherIndex < 0) {
            otherIndex = fallbackKeys.findIndex(k => k !== myKey);
            if (otherIndex >= 0) otherKey = fallbackKeys[otherIndex];
          }
          if (!otherKey) return;

          const storedOther = data.participantProfiles?.[otherKey] || {};
          const otherUid = rawUids[otherIndex] || storedOther.uid || null;
          const otherRaw = fallbackParticipants[otherIndex] || storedOther.name || storedOther.username || 'Collector';
          const otherProfile = getChatIdentityProfile({
            uid: otherUid,
            username: storedOther.username,
            name: storedOther.name || otherRaw
          }) || getChatIdentityProfile(otherRaw);

          const updatedMs = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : (Date.parse(data.updatedAt || '') || 0);
          const lastMessageAtMs = data.lastMessageAt?.toMillis ? data.lastMessageAt.toMillis() : (Date.parse(data.lastMessageAt || '') || 0);
          const sortMs = Math.max(updatedMs, lastMessageAtMs);

          candidates.push({
            id: doc.id,
            ...data,
            otherKey: getChatCanonicalKey(otherProfile || otherRaw),
            otherUid: otherProfile?.uid || otherUid || null,
            otherUser: otherProfile?.name || otherProfile?.username || storedOther.name || storedOther.username || otherRaw,
            otherUsername: otherProfile?.username || storedOther.username || '',
            otherAvatar: otherProfile?.avatarUrl || storedOther.avatarUrl || getCollectorAvatar(otherProfile?.username || otherProfile?.name || otherRaw),
            isOtherAdmin: isUserAdmin(otherProfile?.username || otherProfile?.name || otherRaw),
            __sortMs: sortMs,
            __hasPreview: !!String(data.lastMessage || '').trim()
          });
        });

        // Merge duplicate legacy/UID threads without allowing an empty/newer-looking
        // document to hide the conversation that actually contains the message history.
        const deduped = new Map();
        candidates.forEach(thread => {
          const key = thread.otherKey;
          const current = deduped.get(key);
          if (!current) { deduped.set(key, thread); return; }
          const currentScore = (current.__hasPreview ? 1000000000000 : 0) + current.__sortMs;
          const threadScore = (thread.__hasPreview ? 1000000000000 : 0) + thread.__sortMs;
          if (threadScore > currentScore) deduped.set(key, thread);
        });

        inboxThreadsCache = [...deduped.values()];
        updateInboxUnreadBadge(inboxThreadsCache.filter(isChatThreadUnread).length);
        renderInboxThreads();
      }, err => {
        console.warn('Inbox snapshot error:', err);
        container.innerHTML = `<p class="text-xs text-rose-400 text-center py-10">Error fetching inbox messages.</p>`;
        updateInboxUnreadBadge(0);
      });
    }

    function handleQrisScreenshotUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('qris-proof-img-data').value = e.target.result;
        document.getElementById('qris-proof-preview-img').src = e.target.result;
        document.getElementById('qris-proof-preview-container').classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }

    function initDefaultInventory() {
      const defaultList = [];
      for (let i = 1; i <= 50; i++) {
        const isPremium = i <= 25;
        const cardNum = isPremium ? i : i - 25;
        
        const padLen = isPremium ? (cardNum < 10 ? 2 : 3) : (cardNum < 10 ? 3 : 4);
        const paddedNum = String(cardNum).padStart(padLen, '0');
        
        const cardId = `card-${paddedNum}`;
        const serialStr = `*${paddedNum}`;
        const snFormatted = String(cardNum).padStart(4, '0');
        
        const price = isPremium ? 500000 : 100000;
        const tierVal = isPremium ? "500" : "100";

        defaultList.push({
          id: cardId,
          serial: serialStr,
          name: isPremium ? `Eugene Premium #${paddedNum}` : `Eugene Standard #${paddedNum}`,
          type: isPremium ? 'PREMIUM' : 'STANDARD',
          price: price,
          baseFloorPrice: price,
          owner: null,
          status: 'AVAILABLE',
          imgUrl: `https://placehold.co/1080x1350/${isPremium ? '1e1b4b' : '0f172a'}/${isPremium ? 'fbbf24' : '3b82f6'}?text=${encodeURIComponent(serialStr)}`,
          edition: "Beta Edition: #0",
          sn: snFormatted,
          tier: tierVal,
          printing: "1x"
        });
      }
      return defaultList;
    }

    function exportInventoryBackup() {
      if (!currentUser?.isAdmin) return showToast('Admin access required.');

      showLoadingModal('Generating Fast Backup...', 'Formatting inventory array...', false);

      setTimeout(() => {
        const backupData = {
          exportedAt: new Date().toISOString(),
          exportedBy: currentUser.email || currentUser.name,
          inventoryCount: inventory.length,
          cards: inventory.map(c => ({
            id: c.id,
            serial: c.serial,
            name: c.name,
            type: c.type,
            price: c.price,
            baseFloorPrice: c.baseFloorPrice || c.price,
            owner: c.owner || null,
            status: c.status || 'AVAILABLE',
            imgUrl: c.imgUrl,
            edition: c.edition,
            sn: c.sn,
            tier: c.tier,
            printing: c.printing
          }))
        };

        const blob = new Blob([JSON.stringify(backupData, null, 0)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        const filename = `eugene_inventory_backup_${new Date().toISOString().slice(0,10)}.json`;

        downloadAnchor.href = url;
        downloadAnchor.download = filename;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        URL.revokeObjectURL(url);

        hideLoadingModal();
        showToast('Backup JSON downloaded!');
        addNotification('Backup Downloaded', `Exported state containing ${inventory.length} cards.`, 'fa-download text-amber-400');
      }, 50);
    }

    async function importInventoryBackup(event) {
      if (!currentUser?.isAdmin) return showToast('Admin access required.');

      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function(e) {
        try {
          showLoadingModal('Parsing Backup File...', 'Reading data structure...', true);
          await new Promise(r => setTimeout(r, 20));

          const parsed = JSON.parse(e.target.result);
          const importedCards = Array.isArray(parsed) ? parsed : (parsed.cards || []);

          if (!Array.isArray(importedCards) || importedCards.length === 0) {
            hideLoadingModal();
            showToast('Invalid backup file structure.');
            return;
          }

          const BATCH_LIMIT = 400;
          let processed = 0;

          for (let i = 0; i < importedCards.length; i += BATCH_LIMIT) {
            const chunk = importedCards.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();

            chunk.forEach(c => {
              const cardId = c.id;
              const cardData = {
                id: cardId,
                serial: c.serial,
                name: c.name,
                type: c.type,
                price: c.price,
                baseFloorPrice: c.baseFloorPrice || c.price,
                owner: c.owner || null,
                status: c.status || 'AVAILABLE',
                imgUrl: c.imgUrl || c.img_url,
                edition: c.edition || 'Beta Edition: #0',
                sn: c.sn || '0001',
                tier: c.tier || (c.type === 'PREMIUM' ? '500' : '100'),
                printing: c.printing || '1x'
              };

              const docRef = db.collection("cards").doc(cardId);
              batch.set(docRef, cardData, { merge: true });
            });

            await batch.commit();
            processed += chunk.length;
            updateImportProgress(processed, importedCards.length, `Batch saved to Firestore (${processed}/${importedCards.length})`);
          }

          await loadAppState();
          hideLoadingModal();

          showToast(`Bulk imported ${importedCards.length} cards into Firestore!`);
          addNotification('Firestore Import Success', `Imported ${importedCards.length} records into database.`, 'fa-circle-check text-emerald-400');

        } catch (err) {
          console.error('Firestore Import Error:', err);
          hideLoadingModal();
          showToast('Failed to parse or import backup JSON.');
        } finally {
          event.target.value = '';
        }
      };
      reader.readAsText(file);
    }

    function showLoadingModal(title, subtitle, isProgress = false) {
      document.getElementById('loading-modal-title').innerText = title;
      document.getElementById('loading-modal-subtitle').innerText = subtitle;
      const progressContainer = document.getElementById('import-progress-container');
      
      if (isProgress) {
        progressContainer.classList.remove('hidden');
        updateImportProgress(0, 100, 'Initializing...');
      } else {
        progressContainer.classList.add('hidden');
      }
      
      document.getElementById('loading-modal').classList.remove('hidden');
    }

    function updateImportProgress(current, total, label) {
      const pct = Math.round((current / total) * 100) || 0;
      document.getElementById('import-progress-bar').style.width = `${pct}%`;
      document.getElementById('import-progress-status').innerText = `${current} / ${total}`;
      document.getElementById('import-progress-percent').innerText = `${pct}%`;
      if (label) document.getElementById('loading-modal-subtitle').innerText = label;
    }

    function hideLoadingModal() {
      document.getElementById('loading-modal').classList.add('hidden');
    }

    function loadSavedWishlist() {
      try {
        const savedLocal = localStorage.getItem('eugene_wishlist_ids');
        const savedCookie = getCookie('eugene_wishlist_ids');
        const saved = savedLocal ? JSON.parse(savedLocal) : savedCookie;
        if (saved) wishlist = new Set(saved);
      } catch (e) {}
    }

    function saveWishlistToStorage() {
      try { 
        const arr = Array.from(wishlist);
        localStorage.setItem('eugene_wishlist_ids', JSON.stringify(arr));
        setCookie('eugene_wishlist_ids', arr, 30);
      } catch (e) {}
    }

    function loadSavedCart() {
      try {
        const savedLocal = localStorage.getItem('eugene_cart_items');
        const savedCookie = getCookie('eugene_cart_items');
        const saved = savedLocal ? JSON.parse(savedLocal) : savedCookie;
        if (saved) {
          cart = saved.map(savedItem => inventory.find(c => c.id === savedItem.id) || savedItem).filter(Boolean);
        }
      } catch (e) {}
    }

    function saveCartToStorage() {
      try { 
        localStorage.setItem('eugene_cart_items', JSON.stringify(cart));
        setCookie('eugene_cart_items', cart, 7);
      } catch (e) {}
    }

    let auctionSecondsLeft = 3 * 3600 + 14 * 60 + 22;

    function startAuctionTimer() {
      setInterval(() => {
        if (auctionSecondsLeft > 0) {
          auctionSecondsLeft--;
          const hrs = Math.floor(auctionSecondsLeft / 3600);
          const mins = Math.floor((auctionSecondsLeft % 3600) / 60);
          const secs = auctionSecondsLeft % 60;
          const pad = n => n < 10 ? '0' + n : n;
          const timerEl = document.getElementById('auction-timer');
          if (timerEl) timerEl.innerText = `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
        }
      }, 1000);
    }

    let debounceTimer;
    function debouncedRenderCardGrid() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        visibleCardCount = 10;
        renderCardGrid();
      }, 150);
    }

    async function loadAppState() {
      let loadedFromDb = false;

      await loadCollectorProfiles();

      try {
        const snapshot = await db.collection("cards").get();
        if (!snapshot.empty) {
          const fetchedCards = [];
          snapshot.forEach(doc => {
            const c = doc.data();
            fetchedCards.push({
              id: doc.id,
              serial: c.serial || `*${doc.id}`,
              name: c.name || 'Unnamed Card',
              type: c.type || 'STANDARD',
              price: parseFloat(c.price || 0),
              baseFloorPrice: parseFloat(c.baseFloorPrice || c.price || 0),
              owner: c.owner || null,
              status: c.status || 'AVAILABLE',
              imgUrl: c.imgUrl || `https://placehold.co/1080x1350/0f172a/fbbf24?text=${encodeURIComponent(c.serial || 'Card')}`,
              edition: c.edition || "Beta Edition: #0",
              sn: c.sn || "0001",
              tier: c.tier || (c.type === 'PREMIUM' ? "500" : "100"),
              printing: c.printing || "1x"
            });
          });

          inventory = fetchedCards.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
          loadedFromDb = true;
        }
      } catch (err) {
        console.warn('Firestore fetch exception:', err);
      }

      if (!loadedFromDb || inventory.length === 0) {
        inventory = initDefaultInventory();
      }

      loadSavedCart();
      await fetchListings();
      await fetchActiveAuction();
      await fetchTradeRequests();
      updateAllViews();
    }

    async function fetchListings() {
      try {
        const snapshot = await db.collection("listings").get();
        activeListings = [];
        snapshot.forEach(doc => activeListings.push({ id: doc.id, ...doc.data() }));
        renderP2PListings();
      } catch (e) {
        console.warn('Fetch listings error:', e);
      }
    }

    async function fetchActiveAuction() {
      try {
        const doc = await db.collection("system").doc("activeAuction").get();
        if (doc.exists) {
          activeAuction = doc.data();
        } else {
          activeAuction = null;
        }
        renderAuctionView();
      } catch (e) {
        console.warn('Fetch auction error:', e);
      }
    }

    async function fetchTradeRequests() {
      try {
        const snapshot = await db.collection("tradeRequests").get();
        tradeRequestsList = [];
        snapshot.forEach(doc => tradeRequestsList.push({ id: doc.id, ...doc.data() }));
        renderTradeRequests();
      } catch (e) {
        console.warn('Fetch trade requests error:', e);
      }
    }

    function setupRealtimeSync() {
      db.collection("cards").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "modified" || change.type === "added") {
            const c = change.doc.data();
            const existingCard = inventory.find(i => i.id === change.doc.id);
            if (existingCard) {
              Object.assign(existingCard, {
                name: c.name,
                serial: c.serial,
                type: c.type,
                price: parseFloat(c.price || 0),
                owner: c.owner || null,
                status: c.status || 'AVAILABLE',
                imgUrl: c.imgUrl,
                edition: c.edition,
                sn: c.sn,
                tier: c.tier,
                printing: c.printing
              });
            }
          }
        });
        updateAllViews();
      });

      db.collection("listings").onSnapshot((snapshot) => {
        fetchListings();
      });

      db.collection("tradeRequests").onSnapshot((snapshot) => {
        fetchTradeRequests();
      });

      db.collection("system").doc("activeAuction").onSnapshot((doc) => {
        if (doc.exists) {
          activeAuction = doc.data();
        } else {
          activeAuction = null;
        }
        renderAuctionView();
      });

      db.collection("transactions").onSnapshot((snapshot) => {
        fetchTransactionHistory();
        if (currentUser?.isAdmin) {
          loadPendingTransactions();
        }
      });

      // Collector profiles (display name, avatar, bio, socials) were only ever
      // fetched once via loadCollectorProfiles(), so anyone who edited their
      // profile after that snapshot was taken (or after another visitor's
      // session started) wouldn't show up correctly elsewhere - e.g. the
      // Holders Directory kept showing raw usernames / placeholder avatars.
      // A live listener keeps globalCollectorProfiles current for everyone.
      db.collection("profiles").onSnapshot((snapshot) => {
        globalRawProfilesData = {};
        snapshot.forEach(doc => {
          globalRawProfilesData[doc.id] = doc.data();
        });
        rebuildGlobalCollectorProfiles();
        renderHoldersTable();
        renderHomeMembersList();
        const holderVaultView = document.getElementById('view-holder-vault');
        if (viewingHolderName && holderVaultView && !holderVaultView.classList.contains('hidden')) {
          renderHolderVaultPage(viewingHolderName);
        }
      });

      // Mirrors the listener above for the legacy "users" collection (see the
      // PROFILES <-> USERS SYNC comment near loadCollectorProfiles) so
      // collectors who only exist there also show up live in the Holders
      // Directory / vault pages without needing a page refresh.
      db.collection("users").onSnapshot((snapshot) => {
        globalRawUsersData = {};
        snapshot.forEach(doc => {
          globalRawUsersData[doc.id] = doc.data();
        });
        rebuildGlobalCollectorProfiles();
        renderHoldersTable();
        renderHomeMembersList();
        const holderVaultView = document.getElementById('view-holder-vault');
        if (viewingHolderName && holderVaultView && !holderVaultView.classList.contains('hidden')) {
          renderHolderVaultPage(viewingHolderName);
        }
      });

      setupViewTrackingSync();
      setupUserPresenceSync();
      setupSiteStatsSync();
      setupPostsFeedSync();
    }

    function updateAllViews() {
      applyTranslations();
      renderCardGrid();
      renderOwnedCards();
      renderHoldersTable();
      renderTransactionHistoryTable();
      renderInventoryTable();
      updateRemainingCardsCounter();
      updateHeroStats();
      updateCartTotals();
      renderAuctionView();
      renderTradeRequests();
      renderHomepageHighlights();
      renderHomeStatsStrip();
      // BUGFIX: login/logout resolves asynchronously (Firebase auth), often
      // *after* the Home feed has already rendered once with currentUser
      // still null. Without refreshing the composer + feed here too, the
      // per-post comment box (only injected into the HTML when currentUser
      // is truthy — see renderPostsFeed) stays permanently missing until
      // something else happens to touch the "posts" collection. Refreshing
      // both here keeps them in sync with auth state on whichever tab is
      // currently active.
      refreshHomeComposerState();
      renderPostsFeed();
      if (!document.getElementById('view-analytics').classList.contains('hidden')) {
        renderMarketAnalytics();
      }
    }

    async function renderRevenueTab() {
      if (!currentUser || !currentUser.isAdmin) {
        switchTab('catalog');
        return showToast('Admin access required.');
      }

      await fetchTransactionHistory();

      const PLATFORM_TAX_RATE = 0.02;
      const salesTx = transactionsList.filter(t => t.status === 'APPROVED' && t.type !== 'SELLBACK');

      let totalGrossSales = 0;
      const cardRevenueMap = {};
      salesTx.forEach(tx => {
        const amount = parseFloat(tx.total_amount) || 0;
        totalGrossSales += amount;
        if (Array.isArray(tx.items)) {
          tx.items.forEach(item => {
            const cardId = item.id || item.serial;
            const itemPrice = parseFloat(item.price) || 0;
            if (cardId) cardRevenueMap[cardId] = (cardRevenueMap[cardId] || 0) + itemPrice;
          });
        }
      });

      const totalPlatformTax = totalGrossSales * PLATFORM_TAX_RATE;
      const completedSalesCount = salesTx.length;
      const avgOrderValue = completedSalesCount > 0 ? totalGrossSales / completedSalesCount : 0;

      document.getElementById('rev-tab-gross-sales').innerText = formatIDR(totalGrossSales);
      document.getElementById('rev-tab-platform-tax').innerText = formatIDR(totalPlatformTax);
      document.getElementById('rev-tab-completed-sales').innerText = completedSalesCount;
      document.getElementById('rev-tab-avg-order').innerText = formatIDR(avgOrderValue);

      const listEl = document.getElementById('rev-tab-card-list');
      if (listEl) {
        const sorted = [...inventory]
          .map(c => ({ ...c, _revenue: cardRevenueMap[c.id] || cardRevenueMap[c.serial] || 0 }))
          .sort((a, b) => b._revenue - a._revenue)
          .slice(0, 10);

        listEl.innerHTML = sorted.length ? sorted.map(c => `
          <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex justify-between items-center text-xs">
            <div class="flex items-center gap-3">
              <img src="${c.imgUrl}" class="w-10 h-10 object-contain rounded bg-slate-900 border border-slate-800">
              <div>
                <p class="font-bold text-white">${c.name} (${c.serial})</p>
                <p class="text-[10px] text-slate-400">${c.status === 'SOLD' ? 'Sold' : 'Available'}</p>
              </div>
            </div>
            <div class="text-right font-mono">
              <p class="font-extrabold text-emerald-400">${formatIDR(c._revenue)}</p>
              <p class="text-[9px] text-amber-400">${c.type} Tier</p>
            </div>
          </div>
        `).join('') : `<p class="text-xs text-slate-500">No sales revenue recorded yet.</p>`;
      }
    }


    function renderMarketAnalytics() {
      if (!currentUser || !currentUser.isAdmin) {
        switchTab('catalog');
        return showToast('Market Analytics is restricted exclusively to Admins.');
      }

      const totalVol = transactionsList.filter(t => t.status === 'APPROVED').reduce((sum, t) => sum + (t.total_amount || 0), 0);
      const avgFloor = inventory.length > 0 ? inventory.reduce((s, c) => s + c.price, 0) / inventory.length : 0;
      const collectedCount = inventory.filter(c => c.owner !== null).length;

      document.getElementById('analytics-total-volume').innerText = formatIDR(totalVol);
      document.getElementById('analytics-avg-floor').innerText = formatIDR(avgFloor);
      document.getElementById('analytics-collected-count').innerText = `${collectedCount} / ${inventory.length}`;
      document.getElementById('analytics-trade-reqs').innerText = tradeRequestsList.length;

      const valuationList = document.getElementById('analytics-valuation-list');
      if (valuationList) {
        const sorted = [...inventory].sort((a,b) => b.price - a.price).slice(0, 8);
        valuationList.innerHTML = sorted.map(c => `
          <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex justify-between items-center text-xs">
            <div class="flex items-center gap-3">
              <img src="${c.imgUrl}" class="w-10 h-10 object-contain rounded bg-slate-900 border border-slate-800">
              <div>
                <p class="font-bold text-white">${c.name} (${c.serial})</p>
                <p class="text-[10px] text-slate-400">Owner: ${c.owner || 'Unowned (House)'}</p>
              </div>
            </div>
            <div class="text-right font-mono">
              <p class="font-extrabold text-emerald-400">${formatIDR(c.price)}</p>
              <p class="text-[9px] text-amber-400">${c.type} Tier</p>
            </div>
          </div>
        `).join('');
      }

      renderAnalyticsCharts();
    }

    // ===== VISUAL ANALYTICS CHARTS (Chart.js) =====
    function destroyChart(key) {
      if (chartInstances[key]) {
        chartInstances[key].destroy();
        delete chartInstances[key];
      }
    }

    function groupApprovedTxByDay() {
      const approved = transactionsList
        .filter(t => t.status === 'APPROVED' && t.created_at)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      const dayMap = {};
      approved.forEach(t => {
        const d = new Date(t.created_at);
        const key = isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        if (!dayMap[key]) dayMap[key] = { total: 0, count: 0 };
        dayMap[key].total += (t.total_amount || 0);
        dayMap[key].count += 1;
      });

      const labels = Object.keys(dayMap);
      const dailyTotals = labels.map(l => dayMap[l].total);
      const dailyCounts = labels.map(l => dayMap[l].count);
      let running = 0;
      const cumulative = dailyTotals.map(v => (running += v));

      return { labels, dailyTotals, dailyCounts, cumulative };
    }

    function renderAnalyticsCharts() {
      if (typeof Chart === 'undefined') return;
      if (!currentUser || !currentUser.isAdmin) return;

      Chart.defaults.color = '#94a3b8';
      Chart.defaults.font.family = "'Inter', sans-serif";
      Chart.defaults.font.size = 10;

      const { labels, dailyCounts, cumulative } = groupApprovedTxByDay();

      // --- Cumulative trading volume (line) ---
      const volCanvas = document.getElementById('chart-volume-history');
      if (volCanvas) {
        destroyChart('volume');
        chartInstances.volume = new Chart(volCanvas, {
          type: 'line',
          data: {
            labels: labels.length ? labels : ['No data yet'],
            datasets: [{
              label: 'Cumulative Volume (Rp)',
              data: cumulative.length ? cumulative : [0],
              borderColor: '#34d399',
              backgroundColor: 'rgba(52,211,153,.12)',
              fill: true,
              tension: 0.35,
              pointRadius: 2,
              pointBackgroundColor: '#34d399'
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatIDR(ctx.parsed.y) } } },
            scales: {
              x: { grid: { color: 'rgba(148,163,184,.08)' } },
              y: { grid: { color: 'rgba(148,163,184,.08)' }, ticks: { callback: (v) => formatIDR(v) } }
            }
          }
        });
      }

      // --- Sales volume over time (bar: tx count per day) ---
      const txCanvas = document.getElementById('chart-tx-volume');
      if (txCanvas) {
        destroyChart('txVolume');
        chartInstances.txVolume = new Chart(txCanvas, {
          type: 'bar',
          data: {
            labels: labels.length ? labels : ['No data yet'],
            datasets: [{
              label: 'Sales',
              data: dailyCounts.length ? dailyCounts : [0],
              backgroundColor: 'rgba(129,140,248,.65)',
              borderRadius: 6,
              maxBarThickness: 28
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(148,163,184,.08)' } }
            }
          }
        });
      }

      // --- Rarity distribution (doughnut) ---
      const rarityCanvas = document.getElementById('chart-rarity-dist');
      if (rarityCanvas) {
        const premiumCount = inventory.filter(c => c.type === 'PREMIUM').length;
        const standardCount = inventory.filter(c => c.type === 'STANDARD').length;
        destroyChart('rarity');
        chartInstances.rarity = new Chart(rarityCanvas, {
          type: 'doughnut',
          data: {
            labels: ['Premium', 'Standard'],
            datasets: [{
              data: [premiumCount, standardCount],
              backgroundColor: ['#fbbf24', '#60a5fa'],
              borderColor: '#0f172a',
              borderWidth: 3
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12 } } }
          }
        });
      }

      // --- Floor price by tier (bar) ---
      const floorCanvas = document.getElementById('chart-floor-price');
      if (floorCanvas) {
        const premiumCards = inventory.filter(c => c.type === 'PREMIUM');
        const standardCards = inventory.filter(c => c.type === 'STANDARD');
        const premiumFloor = premiumCards.length ? Math.min(...premiumCards.map(c => c.price)) : 0;
        const standardFloor = standardCards.length ? Math.min(...standardCards.map(c => c.price)) : 0;
        const premiumAvg = premiumCards.length ? premiumCards.reduce((s, c) => s + c.price, 0) / premiumCards.length : 0;
        const standardAvg = standardCards.length ? standardCards.reduce((s, c) => s + c.price, 0) / standardCards.length : 0;
        destroyChart('floor');
        chartInstances.floor = new Chart(floorCanvas, {
          type: 'bar',
          data: {
            labels: ['Premium', 'Standard'],
            datasets: [
              { label: 'Floor Price', data: [premiumFloor, standardFloor], backgroundColor: 'rgba(251,191,36,.75)', borderRadius: 6, maxBarThickness: 40 },
              { label: 'Avg Price', data: [premiumAvg, standardAvg], backgroundColor: 'rgba(96,165,250,.75)', borderRadius: 6, maxBarThickness: 40 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12 } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatIDR(ctx.parsed.y)}` } } },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.08)' }, ticks: { callback: (v) => formatIDR(v) } }
            }
          }
        });
      }
    }

    // ===== REAL VIEW / WATCHER TRACKING =====
    // Real, session-scoped signals — no fabricated numbers. A "view" is counted once per
    // browser session per card. "Watching" is the count of sessions that currently have that
    // card's detail modal open, refreshed via a heartbeat and aged out automatically.
    function getViewSessionId() {
      let sid = sessionStorage.getItem('eugene_view_session');
      if (!sid) {
        sid = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('eugene_view_session', sid);
      }
      return sid;
    }

    function getSessionViewedCards() {
      try {
        return new Set(JSON.parse(sessionStorage.getItem('eugene_viewed_cards') || '[]'));
      } catch (e) {
        return new Set();
      }
    }

    function trackCardView(cardId) {
      const viewed = getSessionViewedCards();
      if (viewed.has(cardId)) return; // only count once per session per card
      viewed.add(cardId);
      sessionStorage.setItem('eugene_viewed_cards', JSON.stringify([...viewed]));

      try {
        db.collection('cardViews').doc(cardId).set({
          views: firebase.firestore.FieldValue.increment(1)
        }, { merge: true });
      } catch (e) {
        console.warn('View tracking error:', e);
      }
    }

    function updatePresence(cardId) {
      try {
        db.collection('cardPresence').doc(getViewSessionId()).set({
          cardId: cardId,
          lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.warn('Presence tracking error:', e);
      }
    }

    function clearPresence() {
      try {
        db.collection('cardPresence').doc(getViewSessionId()).set({
          cardId: null,
          lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.warn('Presence clear error:', e);
      }
    }

    function recomputeWatchers() {
      const now = Date.now();
      const counts = {};
      Object.values(cardPresenceMap).forEach(p => {
        if (!p || !p.cardId || !p.lastSeen) return;
        const seenAt = p.lastSeen.toMillis ? p.lastSeen.toMillis() : new Date(p.lastSeen).getTime();
        if (isNaN(seenAt) || now - seenAt > WATCH_WINDOW_MS) return;
        counts[p.cardId] = (counts[p.cardId] || 0) + 1;
      });
      watcherCountsByCard = counts;
    }

    function totalActiveBrowsers() {
      const now = Date.now();
      let n = 0;
      Object.values(cardPresenceMap).forEach(p => {
        if (!p || !p.cardId || !p.lastSeen) return;
        const seenAt = p.lastSeen.toMillis ? p.lastSeen.toMillis() : new Date(p.lastSeen).getTime();
        if (!isNaN(seenAt) && now - seenAt <= WATCH_WINDOW_MS) n++;
      });
      return n;
    }

    function setupViewTrackingSync() {
      db.collection('cardViews').onSnapshot(snapshot => {
        const map = {};
        snapshot.forEach(doc => { map[doc.id] = doc.data().views || 0; });
        viewCountsMap = map;
        renderHomepageHighlights();
        if (activeDetailCardId) updateCardDetailStatsRow(activeDetailCardId);
      }, e => console.warn('cardViews listener error:', e));

      db.collection('cardPresence').onSnapshot(snapshot => {
        const map = {};
        snapshot.forEach(doc => { map[doc.id] = doc.data(); });
        cardPresenceMap = map;
        recomputeWatchers();
        renderHomepageHighlights();
        if (activeDetailCardId) updateCardDetailStatsRow(activeDetailCardId);
      }, e => console.warn('cardPresence listener error:', e));

      // Presence ages out even without new snapshot events, so re-derive periodically.
      setInterval(() => {
        recomputeWatchers();
        renderHomepageHighlights();
        if (activeDetailCardId) updateCardDetailStatsRow(activeDetailCardId);
      }, 30000);

      // Keep this session's presence fresh while a card detail modal is open.
      setInterval(() => {
        if (currentPresenceCardId) updatePresence(currentPresenceCardId);
      }, HEARTBEAT_MS);

      window.addEventListener('beforeunload', () => { clearPresence(); });
    }

    // ===== HOME PAGE: ACTIVE/OFFLINE MEMBERS (DISCORD-STYLE PRESENCE) =====
    // Reuses the same "write a lastSeen heartbeat, age it out client-side"
    // pattern as the card-watching presence above, but scoped to the whole
    // session (not a specific card) so the Home tab can show who is
    // currently using the app at all.
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function updateUserPresence() {
      if (!currentUser || !currentUser.uid) return;
      try {
        db.collection('userPresence').doc(currentUser.uid).set({
          name: currentUser.name || '',
          username: currentUser.username || '',
          avatarUrl: currentUser.avatarUrl || '',
          email: currentUser.email || '',
          lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (e) {
        console.warn('User presence heartbeat error:', e);
      }
    }

    function startUserHeartbeat() {
      updateUserPresence();
      if (userHeartbeatInterval) clearInterval(userHeartbeatInterval);
      userHeartbeatInterval = setInterval(updateUserPresence, USER_HEARTBEAT_MS);
    }

    function stopUserHeartbeat() {
      if (userHeartbeatInterval) { clearInterval(userHeartbeatInterval); userHeartbeatInterval = null; }
    }

    function setupUserPresenceSync() {
      db.collection('userPresence').onSnapshot(snapshot => {
        const map = {};
        snapshot.forEach(doc => { map[doc.id] = doc.data(); });
        userPresenceMap = map;
        renderHomeMembersList();
      }, e => console.warn('userPresence listener error:', e));

      // Presence ages out even without a new snapshot, so re-derive periodically.
      setInterval(renderHomeMembersList, 30000);
    }

    // ===== HOME PAGE: TOTAL SITE VISITOR COUNTER =====
    // A single running counter (system/siteStats.totalVisitors) that only
    // ever goes up, starting from when this counter was introduced — it
    // can't retroactively count visits from before it existed. Each browser
    // session is counted once (guarded via sessionStorage), so refreshing
    // the page or switching tabs doesn't inflate the number.
    async function trackSiteVisit() {
      try {
        if (sessionStorage.getItem('eugene_visit_counted')) return;
        sessionStorage.setItem('eugene_visit_counted', '1');

        const ref = db.collection('system').doc('siteStats');
        await db.runTransaction(async (tx) => {
          const doc = await tx.get(ref);
          const current = doc.exists ? (doc.data().totalVisitors || 0) : 0;
          tx.set(ref, { totalVisitors: current + 1 }, { merge: true });
        });
      } catch (e) {
        console.warn('Site visit tracking error:', e);
      }
    }

    function setupSiteStatsSync() {
      db.collection('system').doc('siteStats').onSnapshot(doc => {
        totalSiteVisitors = doc.exists ? (doc.data().totalVisitors || 0) : 0;
        renderHomeStatsStrip();
      }, e => console.warn('siteStats listener error:', e));
    }

    function renderHomeStatsStrip() {
      const visitorsEl = document.getElementById('home-stat-visitors');
      if (visitorsEl) visitorsEl.innerText = totalSiteVisitors.toLocaleString('en-US');

      const onlineEl = document.getElementById('home-stat-online');
      if (onlineEl) onlineEl.innerText = document.getElementById('home-active-count')?.innerText || '0';

      const collectorsEl = document.getElementById('home-stat-collectors');
      if (collectorsEl) {
        const uniqueOwners = new Set(inventory.filter(c => c.owner).map(c => c.owner));
        collectorsEl.innerText = uniqueOwners.size;
      }

      const volumeEl = document.getElementById('home-stat-volume');
      if (volumeEl) {
        const volume = transactionsList
          .filter(tx => tx.status === 'APPROVED')
          .reduce((sum, tx) => sum + (tx.total_amount || 0), 0);
        volumeEl.innerText = formatIDR(volume);
      }
    }

    function renderHomeMembersList() {
      const activeList = document.getElementById('home-active-list');
      const offlineList = document.getElementById('home-offline-list');
      const activeCountEl = document.getElementById('home-active-count');
      const offlineCountEl = document.getElementById('home-offline-count');
      const navBadge = document.getElementById('home-active-count-badge');
      if (!activeList || !offlineList) return;

      const dict = i18nDict[currentLanguage];
      const now = Date.now();

      // Build a roster from known collector profiles (so members who are
      // offline still show up), then layer live presence heartbeats on top
      // to decide who is active right now. Real accounts are keyed by uid
      // (so presence can match them); accounts with no uid — e.g. a card
      // owner name an admin typed in that never actually logged in with
      // Google — get a synthetic key instead and always render as offline,
      // since there's no auth session for them to ever send a heartbeat.
      const roster = {};
      const rosterEntries = [];
      Object.entries(globalCollectorProfiles || {}).forEach(([key, p]) => {
        if (!p) return;
        const hasAuth = !!p.uid;
        const candidate = {
          uid: p.uid || null,
          name: p.name || key || 'Collector',
          username: p.username || '',
          avatarUrl: p.avatarUrl || '',
          hasAuth
        };

        // Collapse legacy/no-UID profile records into an authenticated record
        // when they clearly describe the same username/name. Never merge two
        // authenticated accounts merely because they share a display name.
        const matchIndex = rosterEntries.findIndex(existing => {
          if (candidate.uid && existing.uid) return candidate.uid === existing.uid;
          const sameUsername = candidate.username && existing.username && normalizeCollectorValue(candidate.username) === normalizeCollectorValue(existing.username);
          const sameName = candidate.name && existing.name && normalizeCollectorValue(candidate.name) === normalizeCollectorValue(existing.name);
          return !!(sameUsername || (sameName && (!candidate.uid || !existing.uid)));
        });

        if (matchIndex >= 0) {
          const existing = rosterEntries[matchIndex];
          rosterEntries[matchIndex] = {
            ...existing,
            ...candidate,
            uid: existing.uid || candidate.uid,
            hasAuth: existing.hasAuth || candidate.hasAuth,
            name: candidate.hasAuth || !existing.name ? candidate.name : existing.name,
            username: candidate.username || existing.username,
            avatarUrl: candidate.avatarUrl || existing.avatarUrl
          };
        } else {
          rosterEntries.push(candidate);
        }
      });
      if (currentUser && currentUser.uid) {
        const idx = rosterEntries.findIndex(p => p.uid === currentUser.uid);
        const me = { uid: currentUser.uid, name: currentUser.name, username: currentUser.username, avatarUrl: currentUser.avatarUrl, hasAuth: true };
        if (idx >= 0) rosterEntries[idx] = { ...rosterEntries[idx], ...me };
        else rosterEntries.push(me);
      }
      rosterEntries.forEach((p, index) => {
        const rosterId = p.uid || `noauth:${normalizeCollectorValue(p.username || p.name)}:${index}`;
        roster[rosterId] = p;
      });

      const active = [];
      const offline = [];

      Object.keys(roster).forEach(rosterId => {
        const person = { uid: rosterId, ...roster[rosterId] };

        if (!person.hasAuth) {
          offline.push(person);
          return;
        }

        const presence = userPresenceMap[rosterId];
        if (presence && presence.avatarUrl) person.avatarUrl = presence.avatarUrl;
        if (presence && presence.name) person.name = presence.name;

        let isActive = false;
        if (presence && presence.lastSeen) {
          const seenAt = presence.lastSeen.toMillis ? presence.lastSeen.toMillis() : new Date(presence.lastSeen).getTime();
          isActive = !isNaN(seenAt) && (now - seenAt) <= PRESENCE_ACTIVE_WINDOW_MS;
        }
        if (isActive) active.push(person); else offline.push(person);
      });

      // Also surface any presence heartbeat for a uid we don't have a
      // collector profile for yet (edge case: brand-new account before its
      // profile doc synced).
      Object.keys(userPresenceMap).forEach(uid => {
        if (roster[uid]) return;
        const presence = userPresenceMap[uid];
        if (!presence) return;
        const seenAt = presence.lastSeen && presence.lastSeen.toMillis ? presence.lastSeen.toMillis() : (presence.lastSeen ? new Date(presence.lastSeen).getTime() : NaN);
        if (!isNaN(seenAt) && (now - seenAt) <= PRESENCE_ACTIVE_WINDOW_MS) {
          active.push({ uid, name: presence.name || 'Collector', username: presence.username || '', avatarUrl: presence.avatarUrl || '' });
        }
      });

      active.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      offline.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const rowHtml = (p, dotClass) => `
        <div class="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-800/60 transition-colors">
          <div class="relative shrink-0">
            <img src="${escapeHtml(p.avatarUrl) || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(p.uid)}`}" class="w-8 h-8 rounded-full object-cover border border-slate-700">
            <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${dotClass} border-2 border-slate-900"></span>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-bold text-white truncate">${escapeHtml(p.name)}</p>
            ${p.username ? `<p class="text-[10px] text-slate-500 truncate">@${escapeHtml(p.username)}</p>` : ''}
          </div>
        </div>
      `;

      activeList.innerHTML = active.length
        ? active.map(p => rowHtml(p, 'bg-emerald-400')).join('')
        : `<p class="text-[11px] text-slate-500" data-i18n="noActiveUsers">${dict.noActiveUsers}</p>`;

      offlineList.innerHTML = offline.length
        ? offline.map(p => rowHtml(p, 'bg-slate-600')).join('')
        : `<p class="text-[11px] text-slate-500" data-i18n="noOfflineUsers">${dict.noOfflineUsers}</p>`;

      if (activeCountEl) activeCountEl.innerText = active.length;
      if (offlineCountEl) offlineCountEl.innerText = offline.length;
      if (navBadge) {
        if (active.length > 0) { navBadge.innerText = active.length; navBadge.classList.remove('hidden'); }
        else navBadge.classList.add('hidden');
      }
      renderHomeStatsStrip();
    }

    // ===== HOME PAGE: COMMUNITY FEED (POSTS, LIKES, COMMENTS) =====
    function refreshHomeComposerState() {
      const avatar = document.getElementById('home-composer-avatar');
      const hint = document.getElementById('home-composer-login-hint');
      const textInput = document.getElementById('home-post-text-input');
      if (!avatar || !hint || !textInput) return;

      if (currentUser) {
        avatar.src = currentUser.avatarUrl || '';
        avatar.classList.remove('hidden');
        hint.classList.add('hidden');
        textInput.disabled = false;
      } else {
        avatar.classList.add('hidden');
        hint.classList.remove('hidden');
        textInput.disabled = true;
      }
    }

    async function attachPostImage(event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await compressImageToDataUrl(file, 720, 0.75);
        postComposerImageDataUrl = dataUrl;
        document.getElementById('home-post-image-preview').src = dataUrl;
        document.getElementById('home-post-image-preview-wrap').classList.remove('hidden');
      } catch (e) {
        showToast('Could not process that image: ' + e.message);
      }
    }

    function removePostImageDraft() {
      postComposerImageDataUrl = null;
      document.getElementById('home-post-image-preview').src = '';
      document.getElementById('home-post-image-preview-wrap').classList.add('hidden');
    }

    async function submitNewPost() {
      if (!currentUser) { openAuthModal(); return showToast('Please log in first.'); }
      const dict = i18nDict[currentLanguage];
      const textInput = document.getElementById('home-post-text-input');
      const text = textInput.value.trim();
      if (!text && !postComposerImageDataUrl) return showToast(dict.emptyPostWarning);

      const postPayload = {
        type: 'original',
        authorUid: currentUser.uid,
        authorName: currentUser.name || '',
        authorUsername: currentUser.username || '',
        authorAvatar: currentUser.avatarUrl || '',
        text,
        imageUrl: postComposerImageDataUrl || null,
        likes: [],
        commentCount: 0,
        reposts: [],
        quoteCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        await db.collection('posts').add(postPayload);
        textInput.value = '';
        removePostImageDraft();
        showToast(dict.postPublished);
      } catch (e) {
        showToast('Could not publish post: ' + e.message);
      }
    }

    function setupPostsFeedSync() {
      db.collection('posts').orderBy('createdAt', 'desc').limit(50).onSnapshot(snapshot => {
        postsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderPostsFeed();
      }, e => console.warn('posts listener error:', e));
    }

    // Resolves a post by id: checks the live 50-doc feed window first, then a
    // local cache for posts that scrolled out (needed for repost/quote embeds).
    // Returns: post object (found), null (confirmed deleted/missing), or
    // undefined (fetch in flight — caller should render a loading placeholder).
    function getPostById(id) {
      if (!id) return null;
      const inFeed = postsList.find(p => p.id === id);
      if (inFeed) return inFeed;
      if (Object.prototype.hasOwnProperty.call(originalPostsCache, id)) return originalPostsCache[id];
      if (!originalPostsFetching[id]) {
        originalPostsFetching[id] = true;
        db.collection('posts').doc(id).get().then(doc => {
          originalPostsCache[id] = doc.exists ? { id: doc.id, ...doc.data() } : null;
          delete originalPostsFetching[id];
          renderPostsFeed();
        }).catch(() => { delete originalPostsFetching[id]; });
      }
      return undefined;
    }

    function renderPostActionsRow(post, dict) {
      const likes = post.likes || [];
      const likedByMe = !!(currentUser && likes.includes(currentUser.uid));
      const reposts = post.reposts || [];
      const repostedByMe = !!(currentUser && reposts.includes(currentUser.uid));
      const repostCount = reposts.length + (post.quoteCount || 0);

      return `
      <div class="flex items-center gap-4 pt-1 border-t border-slate-800/80 mt-1">
        <button onclick="toggleLikePost('${post.id}')" class="flex items-center gap-1.5 text-xs font-bold ${likedByMe ? 'text-rose-400' : 'text-slate-400 hover:text-rose-400'} transition-colors pt-2">
          <i class="fa-${likedByMe ? 'solid' : 'regular'} fa-heart"></i> ${likes.length} <span class="hidden sm:inline" data-i18n="likeBtnLabel">${dict.likeBtnLabel}</span>
        </button>
        <button onclick="toggleCommentsPanel('${post.id}')" class="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-indigo-400 transition-colors pt-2">
          <i class="fa-regular fa-comment"></i> ${post.commentCount || 0} <span class="hidden sm:inline" data-i18n="commentBtnLabel">${dict.commentBtnLabel}</span>
        </button>
        <div class="relative" data-repost-wrap="${post.id}">
          <button onclick="toggleRepostMenu('${post.id}')" class="flex items-center gap-1.5 text-xs font-bold ${repostedByMe ? 'text-emerald-400' : 'text-slate-400 hover:text-emerald-400'} transition-colors pt-2">
            <i class="fa-solid fa-retweet"></i> ${repostCount} <span class="hidden sm:inline" data-i18n="repostBtnLabel">${dict.repostBtnLabel}</span>
          </button>
          <div id="repost-menu-${post.id}" class="hidden absolute bottom-full left-0 mb-2 w-48 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-20 overflow-hidden">
            <button onclick="handleRepostClick('${post.id}')" class="w-full flex items-center gap-2 px-3 py-2.5 text-[11px] font-bold text-left ${repostedByMe ? 'text-rose-400 hover:bg-rose-500/10' : 'text-slate-200 hover:bg-slate-900'} transition-colors">
              <i class="fa-solid fa-retweet"></i> <span>${repostedByMe ? dict.undoRepostBtnLabel : dict.repostBtnLabel}</span>
            </button>
            <button onclick="openQuoteRepostComposer('${post.id}')" class="w-full flex items-center gap-2 px-3 py-2.5 text-[11px] font-bold text-left text-slate-200 hover:bg-slate-900 transition-colors border-t border-slate-900">
              <i class="fa-solid fa-pen"></i> <span>${dict.quoteRepostBtnLabel}</span>
            </button>
          </div>
        </div>
      </div>`;
    }

    // Compact, non-interactive preview of a quoted/original post — used inside
    // quote-repost cards and the quote-repost composer modal.
    function renderEmbeddedPostSnippet(quotedId, dict) {
      const q = getPostById(quotedId);
      if (q === undefined) {
        return `<div class="border border-slate-800 rounded-2xl p-3 text-[11px] text-slate-500">${dict.loadingFeed}</div>`;
      }
      if (q === null) {
        return `<div class="border border-slate-800 rounded-2xl p-3 text-[11px] text-slate-500">${dict.originalPostUnavailable}</div>`;
      }
      const createdAt = q.createdAt && q.createdAt.toDate ? q.createdAt.toDate() : q.createdAt;
      return `
      <div class="border border-slate-800 rounded-2xl p-3 space-y-2 bg-slate-950/60">
        <div class="flex items-center gap-2">
          <img src="${escapeHtml(q.authorAvatar) || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(q.authorUid || 'x')}`}" class="w-6 h-6 rounded-full object-cover border border-slate-700">
          <p class="text-[11px] font-black text-white">${escapeHtml(q.authorName || 'Collector')} <span class="text-slate-600 font-normal ml-1">${escapeHtml(timeAgoShort(createdAt))}</span></p>
        </div>
        ${q.text ? `<p class="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">${escapeHtml(q.text)}</p>` : ''}
        ${q.imageUrl ? `<button type="button" class="block w-full text-left group cursor-zoom-in" onclick="event.stopPropagation(); openImagePreviewModal('${escapeHtml(q.imageUrl)}', 'Image — ${escapeHtml(q.authorName || 'Collector')}')">
          <span class="relative block w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80">
            <img src="${escapeHtml(q.imageUrl)}" loading="lazy" class="block w-full max-h-[520px] object-contain mx-auto rounded-xl transition-transform duration-200 group-hover:scale-[1.01]" alt="Post image">
            <span class="absolute right-2 bottom-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950/80 border border-white/10 text-[9px] font-black text-white opacity-80 group-hover:opacity-100">
              <i class="fa-solid fa-expand"></i> View
            </span>
          </span>
        </button>` : ''}
      </div>`;
    }

    // Renders the actual content body (header, text, image, actions, comments)
    // for a real content post — used for original posts, quote-repost posts,
    // and for the underlying original embedded inside a repost feed item.
    function renderPostCardBody(post, dict) {
      const canDelete = currentUser && (currentUser.uid === post.authorUid || currentUser.isAdmin);
      const createdAt = post.createdAt && post.createdAt.toDate ? post.createdAt.toDate() : post.createdAt;
      const commentsOpen = openCommentsPostId === post.id;

      return `
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <img src="${escapeHtml(post.authorAvatar) || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(post.authorUid || 'x')}`}" class="w-9 h-9 rounded-full object-cover border border-slate-700">
            <div>
              <p class="text-xs font-black text-white">${escapeHtml(post.authorName || 'Collector')}</p>
              <p class="text-[10px] text-slate-500">${post.authorUsername ? '@' + escapeHtml(post.authorUsername) + ' • ' : ''}${escapeHtml(timeAgoShort(createdAt))}</p>
            </div>
          </div>
          ${canDelete ? `<button onclick="deletePost('${post.id}')" class="w-7 h-7 rounded-xl bg-slate-950 text-slate-500 hover:text-rose-400 flex items-center justify-center transition-colors"><i class="fa-solid fa-trash text-[10px]"></i></button>` : ''}
        </div>

        ${post.text ? `<p class="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">${escapeHtml(post.text)}</p>` : ''}
        ${post.imageUrl ? `<button type="button" class="block w-full text-left group cursor-zoom-in" onclick="event.stopPropagation(); openImagePreviewModal('${escapeHtml(post.imageUrl)}', 'Post Image — ${escapeHtml(post.authorName || 'Collector')}')">
          <span class="relative block w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80">
            <img src="${escapeHtml(post.imageUrl)}" loading="lazy" class="block w-full max-h-[560px] object-contain mx-auto rounded-2xl transition-transform duration-200 group-hover:scale-[1.01]" alt="Post image">
            <span class="absolute right-3 bottom-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950/85 border border-white/10 text-[9px] font-black text-white opacity-80 group-hover:opacity-100 shadow-lg">
              <i class="fa-solid fa-expand"></i> View / Download
            </span>
          </span>
        </button>` : ''}
        ${post.type === 'quote' && post.quotedPostId ? renderEmbeddedPostSnippet(post.quotedPostId, dict) : ''}

        ${renderPostActionsRow(post, dict)}

        <div id="post-comments-${post.id}" class="${commentsOpen ? '' : 'hidden'} space-y-2 pt-2 border-t border-slate-800/80">
          <div id="post-comments-list-${post.id}" class="space-y-2 max-h-56 overflow-y-auto"></div>
          ${currentUser ? `
          <div class="flex items-center gap-2">
            <input type="text" id="post-comment-input-${post.id}" placeholder="${dict.writeCommentPlaceholder}" data-i18n-placeholder="writeCommentPlaceholder" class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-[11px] text-white focus:outline-none focus:border-indigo-500" onkeydown="if(event.key==='Enter'){submitComment('${post.id}');}">
            <button onclick="submitComment('${post.id}')" class="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-[10px] rounded-xl transition-all" data-i18n="sendCommentBtn">${dict.sendCommentBtn}</button>
          </div>` : ''}
        </div>
      `;
    }

    function renderPostsFeed() {
      const container = document.getElementById('home-posts-feed');
      if (!container) return;
      const dict = i18nDict[currentLanguage];

      if (!postsList.length) {
        container.innerHTML = `<div class="empty-state"><i class="fa-regular fa-comments text-3xl text-slate-600 mb-2"></i><p class="text-xs text-slate-500" data-i18n="noPostsYet">${dict.noPostsYet}</p></div>`;
        return;
      }

      container.innerHTML = postsList.map(item => {
        if (item.type === 'repost') {
          const reposterLine = `
            <p class="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 px-1">
              <i class="fa-solid fa-retweet text-emerald-500"></i> ${escapeHtml(item.authorName || 'Collector')} <span data-i18n="repostedLabel">${dict.repostedLabel}</span>
            </p>`;
          const original = getPostById(item.originalPostId);
          if (original === undefined) {
            return `<div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-2" data-post-id="${item.id}">${reposterLine}<p class="text-[11px] text-slate-500 py-4 text-center">${dict.loadingFeed}</p></div>`;
          }
          if (original === null) {
            return `<div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-2" data-post-id="${item.id}">${reposterLine}<p class="text-[11px] text-slate-500 py-4 text-center">${dict.originalPostUnavailable}</p></div>`;
          }
          return `<div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3" data-post-id="${item.id}" data-original-id="${original.id}">${reposterLine}${renderPostCardBody(original, dict)}</div>`;
        }

        return `<div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3" data-post-id="${item.id}">${renderPostCardBody(item, dict)}</div>`;
      }).join('');

      if (openCommentsPostId) renderCommentsList(openCommentsPostId);
    }

    // ===== HOME PAGE: REPOST / QUOTE REPOST =====
    function closeAllRepostMenus() {
      if (openRepostMenuPostId) {
        const prev = document.getElementById(`repost-menu-${openRepostMenuPostId}`);
        if (prev) prev.classList.add('hidden');
        openRepostMenuPostId = null;
      }
    }

    function toggleRepostMenu(postId) {
      const menu = document.getElementById(`repost-menu-${postId}`);
      if (!menu) return;
      const willOpen = menu.classList.contains('hidden');
      closeAllRepostMenus();
      if (willOpen) {
        menu.classList.remove('hidden');
        openRepostMenuPostId = postId;
      }
    }

    async function handleRepostClick(postId) {
      if (!currentUser) { openAuthModal(); return showToast('Please log in first.'); }
      closeAllRepostMenus();
      const dict = i18nDict[currentLanguage];
      const post = getPostById(postId);
      if (!post) return;
      const reposts = post.reposts || [];
      const alreadyReposted = reposts.includes(currentUser.uid);
      const repostDocId = `repost_${currentUser.uid}_${postId}`;

      try {
        if (alreadyReposted) {
          await db.collection('posts').doc(repostDocId).delete();
          await db.collection('posts').doc(postId).update({
            reposts: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
          });
          showToast(dict.repostRemovedToast);
        } else {
          await db.collection('posts').doc(repostDocId).set({
            type: 'repost',
            authorUid: currentUser.uid,
            authorName: currentUser.name || '',
            authorUsername: currentUser.username || '',
            authorAvatar: currentUser.avatarUrl || '',
            originalPostId: postId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          await db.collection('posts').doc(postId).update({
            reposts: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
          });
          showToast(dict.repostSuccessToast);
        }
      } catch (e) {
        showToast('Could not update repost: ' + e.message);
      }
    }

    function openQuoteRepostComposer(postId) {
      if (!currentUser) { openAuthModal(); return showToast('Please log in first.'); }
      closeAllRepostMenus();
      const post = getPostById(postId);
      if (!post) return;
      const dict = i18nDict[currentLanguage];

      quoteRepostTargetPostId = postId;
      quoteRepostImageDataUrl = null;

      const textInput = document.getElementById('quote-repost-text-input');
      if (textInput) textInput.value = '';
      removeQuoteRepostImageDraft();

      const avatar = document.getElementById('quote-repost-avatar');
      if (avatar) avatar.src = currentUser.avatarUrl || '';

      const preview = document.getElementById('quote-repost-original-preview');
      if (preview) preview.innerHTML = renderEmbeddedPostSnippet(postId, dict);

      document.getElementById('quote-repost-modal').classList.remove('hidden');
    }

    function closeQuoteRepostComposer() {
      const modal = document.getElementById('quote-repost-modal');
      if (modal) modal.classList.add('hidden');
      quoteRepostTargetPostId = null;
      quoteRepostImageDataUrl = null;
    }

    async function attachQuoteRepostImage(event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await compressImageToDataUrl(file, 720, 0.75);
        quoteRepostImageDataUrl = dataUrl;
        document.getElementById('quote-repost-image-preview').src = dataUrl;
        document.getElementById('quote-repost-image-preview-wrap').classList.remove('hidden');
      } catch (e) {
        showToast('Could not process that image: ' + e.message);
      }
    }

    function removeQuoteRepostImageDraft() {
      quoteRepostImageDataUrl = null;
      const img = document.getElementById('quote-repost-image-preview');
      const wrap = document.getElementById('quote-repost-image-preview-wrap');
      if (img) img.src = '';
      if (wrap) wrap.classList.add('hidden');
    }

    async function submitQuoteRepost() {
      if (!currentUser) { openAuthModal(); return showToast('Please log in first.'); }
      if (!quoteRepostTargetPostId) return;
      const dict = i18nDict[currentLanguage];
      const textInput = document.getElementById('quote-repost-text-input');
      const text = textInput ? textInput.value.trim() : '';
      const targetId = quoteRepostTargetPostId;

      const postPayload = {
        type: 'quote',
        authorUid: currentUser.uid,
        authorName: currentUser.name || '',
        authorUsername: currentUser.username || '',
        authorAvatar: currentUser.avatarUrl || '',
        text,
        imageUrl: quoteRepostImageDataUrl || null,
        quotedPostId: targetId,
        likes: [],
        commentCount: 0,
        reposts: [],
        quoteCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        await db.collection('posts').add(postPayload);
        await db.collection('posts').doc(targetId).update({
          quoteCount: firebase.firestore.FieldValue.increment(1)
        });
        closeQuoteRepostComposer();
        showToast(dict.quoteRepostPublished);
      } catch (e) {
        showToast('Could not publish quote repost: ' + e.message);
      }
    }

    async function toggleLikePost(postId) {
      if (!currentUser) { openAuthModal(); return showToast('Please log in first.'); }
      const post = postsList.find(p => p.id === postId);
      if (!post) return;
      const likes = post.likes || [];
      const alreadyLiked = likes.includes(currentUser.uid);
      try {
        await db.collection('posts').doc(postId).update({
          likes: alreadyLiked
            ? firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
            : firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
      } catch (e) {
        showToast('Could not update like: ' + e.message);
      }
    }

    function toggleCommentsPanel(postId) {
      const panel = document.getElementById(`post-comments-${postId}`);
      if (!panel) return;

      if (openCommentsPostId === postId) {
        panel.classList.add('hidden');
        openCommentsPostId = null;
        if (postCommentsUnsubscribe) { postCommentsUnsubscribe(); postCommentsUnsubscribe = null; }
        return;
      }

      // Close any previously open thread's live listener before opening a new one.
      if (postCommentsUnsubscribe) { postCommentsUnsubscribe(); postCommentsUnsubscribe = null; }
      const prevPanel = openCommentsPostId ? document.getElementById(`post-comments-${openCommentsPostId}`) : null;
      if (prevPanel) prevPanel.classList.add('hidden');

      openCommentsPostId = postId;
      panel.classList.remove('hidden');

      postCommentsUnsubscribe = db.collection('posts').doc(postId).collection('comments').orderBy('createdAt', 'asc')
        .onSnapshot(snapshot => {
          postCommentsCache[postId] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          renderCommentsList(postId);
        }, e => console.warn('comments listener error:', e));
    }

    function renderCommentsList(postId) {
      const list = document.getElementById(`post-comments-list-${postId}`);
      if (!list) return;
      const dict = i18nDict[currentLanguage];
      const comments = postCommentsCache[postId] || [];

      list.innerHTML = comments.length ? comments.map(c => {
        const createdAt = c.createdAt && c.createdAt.toDate ? c.createdAt.toDate() : c.createdAt;
        return `
        <div class="flex items-start gap-2">
          <img src="${escapeHtml(c.authorAvatar) || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(c.authorUid || 'x')}`}" class="w-6 h-6 rounded-full object-cover border border-slate-700 shrink-0">
          <div class="bg-slate-950 rounded-xl px-2.5 py-1.5 flex-1 min-w-0">
            <p class="text-[10px] font-bold text-white">${escapeHtml(c.authorName || 'Collector')} <span class="text-slate-600 font-normal ml-1">${escapeHtml(timeAgoShort(createdAt))}</span></p>
            <p class="text-[11px] text-slate-300 break-words">${escapeHtml(c.text)}</p>
          </div>
        </div>`;
      }).join('') : `<p class="text-[10px] text-slate-500" data-i18n="noCommentsYet">${dict.noCommentsYet}</p>`;
    }

    async function submitComment(postId) {
      if (!currentUser) { openAuthModal(); return showToast('Please log in first.'); }
      const input = document.getElementById(`post-comment-input-${postId}`);
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      try {
        await db.collection('posts').doc(postId).collection('comments').add({
          authorUid: currentUser.uid,
          authorName: currentUser.name || '',
          authorAvatar: currentUser.avatarUrl || '',
          text,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('posts').doc(postId).update({
          commentCount: firebase.firestore.FieldValue.increment(1)
        });
        input.value = '';
      } catch (e) {
        showToast('Could not post comment: ' + e.message);
      }
    }

    async function deletePost(postId) {
      const dict = i18nDict[currentLanguage];
      if (!confirm(dict.deletePostConfirm)) return;
      try {
        const post = getPostById(postId);
        await db.collection('posts').doc(postId).delete();

        if (post && post.type === 'quote' && post.quotedPostId) {
          db.collection('posts').doc(post.quotedPostId).update({
            quoteCount: firebase.firestore.FieldValue.increment(-1)
          }).catch(() => {});
        }

        // Best-effort cleanup: remove any repost wrapper docs pointing at this
        // post so they don't linger in the feed as "no longer available".
        db.collection('posts').where('type', '==', 'repost').where('originalPostId', '==', postId).get()
          .then(snap => snap.forEach(doc => doc.ref.delete().catch(() => {})))
          .catch(() => {});

        showToast(dict.postDeleted);
      } catch (e) {
        showToast('Could not delete post: ' + e.message);
      }
    }

    function updateCardDetailStatsRow(cardId) {
      const row = document.getElementById('detail-card-view-stats');
      if (!row) return;
      const views = viewCountsMap[cardId] || 0;
      const watching = watcherCountsByCard[cardId] || 0;
      row.innerHTML = `
        <span class="flex items-center gap-1.5"><i class="fa-solid fa-eye text-slate-500"></i> ${views} view${views === 1 ? '' : 's'}</span>
        ${watching > 0 ? `<span class="flex items-center gap-1.5 text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ${watching} watching now</span>` : ''}
      `;
    }

    // ===== HOMEPAGE: FEATURED CARD / TRENDING / ACTIVITY FEED / STATS VISUAL =====
    function timeAgoShort(dateVal) {
      if (!dateVal) return '';
      const then = new Date(dateVal).getTime();
      if (isNaN(then)) return '';
      const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
      if (diffSec < 60) return currentLanguage === 'ID' ? 'Baru saja' : 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return currentLanguage === 'ID' ? `${diffMin} menit lalu` : `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return currentLanguage === 'ID' ? `${diffHr} jam lalu` : `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
      return timeAgoLabel(dateVal);
    }

    // Small grammar-aware phrase helpers (Indonesian doesn't pluralize, so these
    // branch on currentLanguage rather than going through the plain dict lookup —
    // same pattern as timeAgoShort/timeAgoLabel above).
    function viewsCountLabel(views) {
      return currentLanguage === 'ID' ? `${views} kali dilihat` : `${views} view${views === 1 ? '' : 's'}`;
    }
    function watchingNowLabel(count) {
      return currentLanguage === 'ID' ? `${count} sedang menonton` : `${count} watching now`;
    }
    function browsingNowLabel(count) {
      return currentLanguage === 'ID' ? `${count} sedang menjelajah` : `${count} browsing now`;
    }
    function copiesInSeriesLabel(n) {
      return currentLanguage === 'ID' ? `Hanya ${n} kartu dalam seri ini` : `Only ${n} copies in this series`;
    }
    function watchingActivityLabel(count, serial) {
      return currentLanguage === 'ID'
        ? `<strong class="text-white">${count}</strong> orang sedang melihat <strong class="text-white">${serial}</strong> sekarang`
        : `<strong class="text-white">${count}</strong> ${count === 1 ? 'person is' : 'people are'} looking at <strong class="text-white">${serial}</strong> right now`;
    }

    function renderFeaturedCard() {
      const container = document.getElementById('featured-card-content');
      if (!container) return;

      const available = inventory.filter(c => c.status !== 'SOLD');
      const pool = available.length ? available : inventory;
      const dict = i18nDict[currentLanguage];
      if (pool.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-8 text-slate-500 text-xs">${dict.noCardsAvailableYet}</div>`;
        return;
      }

      const featured = [...pool].sort((a, b) => (b.type === 'PREMIUM' ? 1 : 0) - (a.type === 'PREMIUM' ? 1 : 0) || b.price - a.price)[0];
      const isPremium = featured.type === 'PREMIUM';
      const rarity = computeRarityIndex(featured);
      const views = viewCountsMap[featured.id] || 0;
      const watching = watcherCountsByCard[featured.id] || 0;

      container.innerHTML = `
        <div class="${isPremium ? 'card-holo-premium' : 'card-holo-standard'} rounded-2xl p-3 relative mx-auto w-full max-w-[200px]">
          ${isPremium ? '<div class="foil-sweep"></div><span class="rarity-ribbon">PREMIUM</span>' : ''}
          <div class="w-full aspect-[4/5] bg-slate-950/80 rounded-xl border border-slate-800 p-1.5 overflow-hidden relative z-[2] glass-sheen">
            <div class="w-full h-full flex items-center justify-center overflow-hidden rounded-lg bg-slate-900">
              <img src="${featured.imgUrl}" loading="lazy" class="w-full h-full object-contain">
            </div>
          </div>
          <p class="text-center font-black ${isPremium ? 'text-amber-400 serial-embossed-premium' : 'text-blue-400'} font-mono serial-engraved mt-2 relative z-[2]">${featured.serial}</p>
        </div>
        <div class="space-y-3">
          <div>
            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${isPremium ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}">${featured.type}</span>
            <h4 class="text-lg font-black text-white mt-1.5">${featured.name}</h4>
            <p class="text-[11px] text-slate-400 mt-0.5">${dict.ownerLabel}: <strong class="text-slate-300">${featured.owner || dict.unownedHouse}</strong></p>
          </div>
          <div class="flex items-center gap-6">
            <div>
              <p class="text-[9px] text-slate-500 font-bold uppercase">${dict.priceWord}</p>
              <p class="text-xl font-black font-mono text-emerald-400">${formatIDR(featured.price)}</p>
            </div>
            <div>
              <p class="text-[9px] text-slate-500 font-bold uppercase">${dict.mpRarityIndex}</p>
              <p class="text-xl font-black font-mono text-amber-400">${rarity}<span class="text-xs text-slate-500">/100</span></p>
            </div>
          </div>
          <div class="flex items-center gap-4 text-[10px] font-bold text-slate-400">
            <span class="flex items-center gap-1.5"><i class="fa-solid fa-eye text-slate-500"></i> ${viewsCountLabel(views)}</span>
            ${watching > 0 ? `<span class="flex items-center gap-1.5 text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ${watchingNowLabel(watching)}</span>` : ''}
          </div>
          <div class="flex gap-2 pt-1">
            <button onclick="openCardDetailModal('${featured.id}')" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all">${dict.viewDetailsBtn}</button>
            ${featured.status !== 'SOLD' ? `<button onclick="addToCart('${featured.id}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all">${dict.btnAddToCart}</button>` : ''}
          </div>
        </div>
      `;
    }

    function renderTrendingCards() {
      const row = document.getElementById('trending-cards-row');
      if (!row) return;

      // "Trending" = cards with the most real activity: sales, trade proposals, and page
      // views/live watchers, falling back to highest price so the row is never empty.
      const activityCount = {};
      transactionsList.forEach(t => (t.items || []).forEach(i => { if (i.id) activityCount[i.id] = (activityCount[i.id] || 0) + 3; }));
      tradeRequestsList.forEach(r => { if (r.cardId) activityCount[r.cardId] = (activityCount[r.cardId] || 0) + 2; });
      Object.entries(viewCountsMap).forEach(([cardId, v]) => { activityCount[cardId] = (activityCount[cardId] || 0) + v; });
      Object.entries(watcherCountsByCard).forEach(([cardId, w]) => { activityCount[cardId] = (activityCount[cardId] || 0) + w * 5; });

      const ranked = [...inventory].sort((a, b) => {
        const diff = (activityCount[b.id] || 0) - (activityCount[a.id] || 0);
        return diff !== 0 ? diff : b.price - a.price;
      }).slice(0, 8);

      if (ranked.length === 0) {
        row.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs w-full">No cards yet.</div>`;
        return;
      }

      row.innerHTML = ranked.map(card => {
        const isPremium = card.type === 'PREMIUM';
        const hits = activityCount[card.id] || 0;
        const watching = watcherCountsByCard[card.id] || 0;
        const views = viewCountsMap[card.id] || 0;
        return `
          <div class="${isPremium ? 'card-holo-premium' : 'card-holo-standard'} rounded-xl p-2 relative shrink-0 w-32 cursor-pointer" onclick="openCardDetailModal('${card.id}')">
            ${isPremium ? '<div class="foil-sweep"></div>' : ''}
            ${hits > 0 ? `<span class="absolute top-1.5 left-1.5 z-[3] text-[8px] font-black px-1.5 py-0.5 rounded-full bg-orange-500/90 text-white flex items-center gap-1"><i class="fa-solid fa-fire"></i> Hot</span>` : ''}
            <div class="w-full aspect-[4/5] bg-slate-950/80 rounded-lg border border-slate-800 overflow-hidden relative z-[2]">
              <img src="${card.imgUrl}" loading="lazy" class="w-full h-full object-contain">
            </div>
            <p class="text-center font-black ${isPremium ? 'text-amber-400' : 'text-blue-400'} font-mono text-[10px] mt-1.5 relative z-[2]">${card.serial}</p>
            <p class="text-center font-mono text-emerald-400 text-[10px] font-extrabold relative z-[2]">${formatIDR(card.price)}</p>
            <p class="text-center text-[9px] font-bold relative z-[2] mt-0.5 ${watching > 0 ? 'text-emerald-400' : 'text-slate-500'}">
              ${watching > 0 ? `<span class="w-1 h-1 rounded-full bg-emerald-400 inline-block animate-pulse mr-1"></span>${watching} watching` : `<i class="fa-solid fa-eye mr-1"></i>${views} views`}
            </p>
          </div>
        `;
      }).join('');
    }

    function renderActivityFeed() {
      const list = document.getElementById('activity-feed-list');
      const liveBadge = document.getElementById('activity-live-badge');
      if (!list) return;

      const browsingNow = totalActiveBrowsers();
      if (liveBadge) {
        liveBadge.innerHTML = browsingNow > 0
          ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ${browsingNow} browsing now`
          : `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live`;
      }

      const soldEvents = transactionsList
        .filter(t => t.status === 'APPROVED' && t.created_at)
        .map(t => ({
          type: 'sold',
          time: t.created_at,
          html: `<i class="fa-solid fa-fire text-orange-400 w-4"></i> <span><strong class="text-white">${(t.items && t.items[0] && t.items[0].serial) || 'A card'}</strong> sold to <strong class="text-white">${t.user_name || 'a collector'}</strong></span>`
        }));

      const tradeEvents = tradeRequestsList
        .filter(r => r.created_at)
        .map(r => ({
          type: 'trade',
          time: r.created_at,
          html: `<i class="fa-solid fa-gem text-cyan-400 w-4"></i> <span><strong class="text-white">${r.proposer || 'A collector'}</strong> proposed a trade for <strong class="text-white">${r.serial || 'a card'}</strong></span>`
        }));

      // Real watcher signal: any card currently being watched by someone, surfaced as its own
      // activity item (not fabricated — pulled straight from live cardPresence data).
      const watchingEvents = Object.entries(watcherCountsByCard)
        .filter(([, count]) => count > 0)
        .map(([cardId, count]) => {
          const card = inventory.find(c => c.id === cardId);
          if (!card) return null;
          return {
            type: 'watching',
            time: new Date().toISOString(),
            sortWeight: -1, // always float near the top while live
            html: `<i class="fa-solid fa-eye text-emerald-400 w-4"></i> <span><strong class="text-white">${count}</strong> ${count === 1 ? 'person is' : 'people are'} looking at <strong class="text-white">${card.serial}</strong> right now</span>`
          };
        })
        .filter(Boolean);

      const combined = [...watchingEvents, ...soldEvents, ...tradeEvents]
        .sort((a, b) => {
          if (a.sortWeight === -1 && b.sortWeight !== -1) return -1;
          if (b.sortWeight === -1 && a.sortWeight !== -1) return 1;
          return new Date(b.time) - new Date(a.time);
        })
        .slice(0, 6);

      if (combined.length === 0) {
        list.innerHTML = `
          <div class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-500 flex items-center gap-2">
            <i class="fa-solid fa-circle-info w-4"></i> No marketplace activity yet — be the first to collect a card!
          </div>
        `;
        return;
      }

      list.innerHTML = combined.map(ev => `
        <div class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">${ev.html}</div>
          <span class="text-[10px] text-slate-500 font-mono shrink-0">${ev.type === 'watching' ? 'now' : timeAgoShort(ev.time)}</span>
        </div>
      `).join('');
    }

    function renderMarketplaceStatsVisual() {
      const rarityBars = document.getElementById('rarity-distribution-bars');
      const progressVisual = document.getElementById('marketplace-progress-visual');
      if (!rarityBars || !progressVisual) return;

      const total = inventory.length || 1;
      const premiumCount = inventory.filter(c => c.type === 'PREMIUM').length;
      const standardCount = inventory.filter(c => c.type === 'STANDARD').length;
      const soldCount = inventory.filter(c => c.status === 'SOLD').length;

      const premiumPct = Math.round((premiumCount / total) * 100);
      const standardPct = Math.round((standardCount / total) * 100);
      const soldPct = Math.round((soldCount / total) * 100);

      rarityBars.innerHTML = `
        <div>
          <div class="flex justify-between text-[10px] font-bold mb-1"><span class="text-amber-400">Premium</span><span class="text-slate-400">${premiumCount} cards (${premiumPct}%)</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${premiumPct}%; background: linear-gradient(90deg,#f59e0b,#fbbf24);"></div></div>
        </div>
        <div>
          <div class="flex justify-between text-[10px] font-bold mb-1"><span class="text-blue-400">Standard</span><span class="text-slate-400">${standardCount} cards (${standardPct}%)</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${standardPct}%; background: linear-gradient(90deg,#3b82f6,#60a5fa);"></div></div>
        </div>
      `;

      progressVisual.innerHTML = `
        <div>
          <div class="flex justify-between text-[10px] font-bold mb-1"><span class="text-emerald-400">Cards Collected</span><span class="text-slate-400">${soldCount} / ${inventory.length} (${soldPct}%)</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${soldPct}%; background: linear-gradient(90deg,#10b981,#34d399);"></div></div>
        </div>
        <div class="grid grid-cols-2 gap-3 pt-1">
          <div class="stat-card text-center">
            <p class="text-[9px] text-slate-500 font-bold uppercase">Collectors</p>
            <p class="text-base font-black font-mono text-white">${document.getElementById('hero-stat-collectors')?.innerText || '0'}</p>
          </div>
          <div class="stat-card text-center">
            <p class="text-[9px] text-slate-500 font-bold uppercase">Trading Volume</p>
            <p class="text-base font-black font-mono text-emerald-400">${document.getElementById('hero-stat-volume')?.innerText || 'Rp 0'}</p>
          </div>
        </div>
      `;
    }

    function renderHomepageHighlights() {
      renderFeaturedCard();
      renderTrendingCards();
      renderActivityFeed();
      renderMarketplaceStatsVisual();
    }

    function renderAuctionView() {
      const titleEl = document.getElementById('auction-card-title');
      const serialEl = document.getElementById('auction-card-serial');
      const imgEl = document.getElementById('auction-card-img');
      const ownerEl = document.getElementById('auction-card-owner-info');
      const actionContainer = document.getElementById('auction-header-action-container');
      const bidEl = document.getElementById('auction-current-bid');
      const bidderEl = document.getElementById('auction-high-bidder');
      const bidInput = document.getElementById('bid-input-amount');
      const bidBtn = document.getElementById('place-bid-btn');
      const historyEl = document.getElementById('auction-bid-history');

      if (!titleEl) return;

      if (!activeAuction) {
        titleEl.innerText = currentLanguage === 'ID' ? "Tidak Ada Lelang Kartu Aktif" : "No Active Card Auction";
        serialEl.innerText = "*--";
        if (imgEl) imgEl.src = "https://placehold.co/1080x1350/1e1b4b/fbbf24?text=No+Auction";
        if (ownerEl) ownerEl.innerHTML = `<span data-i18n="ownerLabel">${i18nDict[currentLanguage].ownerLabel}</span>: <strong class="text-white">None</strong>`;
        if (actionContainer) actionContainer.innerHTML = '';
        if (bidEl) bidEl.innerText = '—';
        if (bidderEl) bidderEl.innerText = currentLanguage === 'ID' ? 'Belum ada' : 'None';
        if (bidInput) { bidInput.value = ''; bidInput.disabled = true; bidInput.placeholder = currentLanguage === 'ID' ? 'Tidak ada lelang aktif' : 'No active auction'; }
        if (bidBtn) bidBtn.disabled = true;
        if (historyEl) historyEl.innerHTML = `<p class="text-center text-slate-500 py-6">${currentLanguage === 'ID' ? 'Belum ada riwayat tawaran.' : 'No bid history yet.'}</p>`;
        return;
      }

      titleEl.innerText = activeAuction.name || "Eugene Genesis Card";
      serialEl.innerText = activeAuction.serial || "*01";
      if (imgEl) imgEl.src = activeAuction.imgUrl || "https://placehold.co/1080x1350/1e1b4b/fbbf24?text=Card";
      if (ownerEl) ownerEl.innerHTML = `<span data-i18n="ownerLabel">${i18nDict[currentLanguage].ownerLabel}</span>: <strong class="text-white">${activeAuction.owner || 'Admin'}</strong>`;

      const currentBidValue = Number(activeAuction.currentBid || activeAuction.startingPrice || 0);
      if (bidEl) bidEl.innerText = formatIDR(currentBidValue);
      if (bidderEl) bidderEl.innerText = (activeAuction.highBidder && activeAuction.highBidder !== 'None') ? activeAuction.highBidder : (currentLanguage === 'ID' ? 'Belum ada tawaran' : 'No bids yet');

      const isOwnAuction = currentUser && (currentUser.name === activeAuction.owner || currentUser.username === activeAuction.owner);
      if (bidInput) {
        bidInput.disabled = !!isOwnAuction;
        bidInput.placeholder = isOwnAuction ? (currentLanguage === 'ID' ? 'Tidak bisa menawar milik sendiri' : "Can't bid on your own card") : `e.g. ${currentBidValue + 25000}`;
      }
      if (bidBtn) bidBtn.disabled = !!isOwnAuction;

      const history = Array.isArray(activeAuction.bidHistory) ? [...activeAuction.bidHistory].reverse() : [];
      if (historyEl) {
        historyEl.innerHTML = history.length === 0
          ? `<p class="text-center text-slate-500 py-6">${currentLanguage === 'ID' ? 'Belum ada riwayat tawaran.' : 'No bid history yet.'}</p>`
          : history.map(b => `
              <div class="flex justify-between items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <span class="font-bold text-white">${b.bidder}</span>
                <span class="font-mono text-emerald-400 font-black">${formatIDR(b.amount)}</span>
              </div>
            `).join('');
      }

      const canCancel = currentUser && (currentUser.isAdmin || currentUser.name === activeAuction.owner || currentUser.username === activeAuction.owner);
      if (actionContainer) {
        if (canCancel) {
          actionContainer.innerHTML = `
            <button onclick="cancelActiveAuction()" class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center gap-2">
              <i class="fa-solid fa-ban"></i> Cancel Auction (${currentUser.isAdmin && currentUser.name !== activeAuction.owner ? 'Admin' : 'Owner'})
            </button>
          `;
        } else {
          actionContainer.innerHTML = '';
        }
      }
    }

    function updateRemainingCardsCounter() {
      const remainingCount = inventory.filter(c => c.status === 'AVAILABLE').length;
      const counterEl = document.getElementById('remaining-cards-count');
      if (counterEl) counterEl.innerText = remainingCount;
    }

    function updateHeroStats() {
      const collectorsEl = document.getElementById('hero-stat-collectors');
      const volumeEl = document.getElementById('hero-stat-volume');
      if (!collectorsEl || !volumeEl) return;

      const uniqueOwners = new Set(inventory.filter(c => c.owner).map(c => c.owner));
      collectorsEl.innerText = uniqueOwners.size;

      const volume = transactionsList
        .filter(tx => tx.status === 'APPROVED')
        .reduce((sum, tx) => sum + (tx.total_amount || 0), 0);
      volumeEl.innerText = formatIDR(volume);
    }

    // ===== FIRST-TIME ONBOARDING =====
    function openOnboardingModal() {
      const modal = document.getElementById('onboarding-modal');
      if (modal) modal.classList.remove('hidden');
    }

    function closeOnboardingModal() {
      const modal = document.getElementById('onboarding-modal');
      if (modal) modal.classList.add('hidden');
      localStorage.setItem('eugene_onboarded', '1');
    }

    function showOnboardingIfFirstVisit() {
      if (!localStorage.getItem('eugene_onboarded')) {
        openOnboardingModal();
      }
    }

    document.addEventListener('DOMContentLoaded', async () => {
      localStorage.removeItem('eugene_cards_override');
      deleteCookie('eugene_cards_override');

      loadSavedWishlist();
      loadNotifications();
      inventory = initDefaultInventory(); 
      updateAllViews(); 

      await loadAppState();
      setupRealtimeSync();
      renderAuthHeader();
      startAuctionTimer();
      setupCardTiltEffect();
      switchTab('home'); // Home is the main landing page on first open
      trackSiteVisit();
      showOnboardingIfFirstVisit();

      auth.onAuthStateChanged((user) => {
        if (user) {
          handleUserSession(user);
        } else {
          currentUser = null;
          if (inboxUnsubscribe) { inboxUnsubscribe(); inboxUnsubscribe = null; }
          updateInboxUnreadBadge(0);
          renderAuthHeader();
          updateAllViews();
        }
      });

      document.addEventListener('click', (e) => {
        const ownerTrigger = document.getElementById('owner-dropdown-trigger');
        const ownerMenu = document.getElementById('owner-dropdown-menu');
        const tradeTrigger = document.getElementById('trade-dropdown-trigger');
        const tradeMenu = document.getElementById('trade-dropdown-menu');
        const notifBtn = document.getElementById('notif-toggle-btn');
        const notifDropdown = document.getElementById('notification-dropdown');

        if (ownerTrigger && ownerMenu && !ownerTrigger.contains(e.target) && !ownerMenu.contains(e.target)) {
          ownerMenu.classList.add('hidden');
        }

        if (openRepostMenuPostId) {
          const repostWrap = document.querySelector(`[data-repost-wrap="${openRepostMenuPostId}"]`);
          if (repostWrap && !repostWrap.contains(e.target)) {
            closeAllRepostMenus();
          }
        }

        if (tradeTrigger && tradeMenu && !tradeTrigger.contains(e.target) && !tradeMenu.contains(e.target)) {
          tradeMenu.classList.add('hidden');
        }

        if (notifDropdown && notifBtn && !notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
          notifDropdown.classList.add('hidden');
        }
      });
    });

    function renderAuthHeader() {
      const container = document.getElementById('auth-header-container');
      const adminNavs = document.querySelectorAll('.admin-only-nav');
      const analyticsNavs = document.querySelectorAll('.analytics-nav-btn');
      const adminSep = document.getElementById('admin-nav-separator');

      if (currentUser) {
        if (currentUser.isAdmin) {
          adminNavs.forEach(el => el.classList.remove('hidden'));
          analyticsNavs.forEach(el => el.classList.remove('hidden'));
          if (adminSep) adminSep.classList.remove('hidden');
        } else {
          adminNavs.forEach(el => el.classList.add('hidden'));
          analyticsNavs.forEach(el => el.classList.add('hidden'));
          if (adminSep) adminSep.classList.add('hidden');
        }

        const avatarImgHtml = currentUser.avatarUrl 
          ? `<img src="${currentUser.avatarUrl}" class="w-7 h-7 rounded-full object-cover border border-slate-700">`
          : `<i class="fa-solid fa-user-circle text-lg text-slate-400"></i>`;

        let badgeText = currentUser.isAdmin ? 'Admin' : (currentUser.username ? `@${currentUser.username}` : 'Standard Member');
        let badgeColor = currentUser.isAdmin ? 'text-rose-400' : 'text-slate-400';

        container.innerHTML = `
          <div class="flex items-center gap-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-1.5 pl-2.5 cursor-pointer transition-all" onclick="openProfileManagerModal()">
            ${avatarImgHtml}
            <div class="flex flex-col text-right">
              <span class="text-xs font-black text-white leading-tight">${currentUser.name}</span>
              <span class="text-[9px] font-bold ${badgeColor} font-mono">${badgeText}</span>
            </div>
            <button onclick="event.stopPropagation(); logoutUser();" class="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg ml-1 transition-all"><i class="fa-solid fa-right-from-bracket text-xs"></i></button>
          </div>
        `;
      } else {
        adminNavs.forEach(el => el.classList.add('hidden'));
        analyticsNavs.forEach(el => el.classList.add('hidden'));
        if (adminSep) adminSep.classList.add('hidden');
        container.innerHTML = `<button onclick="openAuthModal()" class="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl transition-all">Log In</button>`;
      }
      renderAuctionView();
      refreshHomeComposerState();
    }

    function openAuthModal() { document.getElementById('auth-modal').classList.remove('hidden'); }
    function closeAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); }

    // Payment proof screenshots are stored as base64 data URLs. Opening those
    // directly via <a target="_blank"> is unreliable (browsers frequently
    // block/strip large data: URL navigations), so route every "View Payment
    // Proof" / "View Receipt" action through this in-app preview modal instead.
    function openImagePreviewModal(imgUrl, title = 'Payment Proof') {
      if (!imgUrl) return showToast('No proof image available for this transaction.');
      document.getElementById('image-preview-title').innerText = title;
      document.getElementById('image-preview-img').src = imgUrl;
      const downloadEl = document.getElementById('image-preview-download');
      downloadEl.href = imgUrl;
      downloadEl.download = `eugene-card-${String(title || 'image').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'image'}.png`;
      document.getElementById('image-preview-modal').classList.remove('hidden');
    }

    function closeImagePreviewModal() {
      document.getElementById('image-preview-modal').classList.add('hidden');
      document.getElementById('image-preview-img').src = '';
    }

    function viewTransactionProof(txId) {
      const proofUrl = proofUrlById[txId];
      if (!proofUrl) return showToast('No proof file attached to this transaction.');
      openImagePreviewModal(proofUrl, `Payment Proof — ${txId}`);
    }

    async function loginWithGoogle() {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await auth.signInWithPopup(provider);
      } catch (error) {
        showToast('Google Login Error: ' + error.message);
      }
    }

    async function handleUserSession(user) {
      const email = user.email ? user.email.toLowerCase() : '';

      await loadCollectorProfiles();
      const firestoreProfile = globalRawProfilesData[email];
      const savedCustomProfile = firestoreProfile || localStorage.getItem(`profile_${email}`) || getCookie(`profile_${email}`);
      let customData = {};
      if (savedCustomProfile) {
        try { customData = typeof savedCustomProfile === 'object' ? savedCustomProfile : JSON.parse(savedCustomProfile); } catch (e) {}
      }

      // Adopt any legacy "users/{uid}" data (see PROFILES <-> USERS SYNC
      // comment near loadCollectorProfiles) for fields the "profiles" doc
      // doesn't already have a value for, so a collector who signed up before
      // "profiles" existed doesn't lose their name/avatar/bio/socials on
      // their next login — and so the account gets adopted into "profiles"
      // (keyed by their real email) instead of only ever resolving by uid.
      if (globalRawUsersData[user.uid] && Object.keys(customData).length === 0) {
        customData = mapUsersDocToProfileShape(globalRawUsersData[user.uid]);
      }

      const resolvedName = user.displayName || (email ? email.split('@')[0] : "Eugene");
      const name = customData.name || resolvedName;
      let username = customData.username || name.toLowerCase().replace(/\s+/g, '_');

      let isTaken = false;
      for (let emailKey in globalCollectorProfiles) {
        // BUGFIX: a collector's own entry in globalCollectorProfiles isn't always
        // keyed by email — anyone adopted from the legacy "users" collection (see
        // mapUsersDocToProfileShape above) is keyed by uid instead. Excluding only
        // `email` let those accounts collide with themselves here on every login,
        // appending a new random suffix each time even though the username was
        // never actually taken by anyone else.
        if (emailKey !== email && emailKey !== user.uid) {
          const p = globalCollectorProfiles[emailKey];
          if (p.username?.toLowerCase() === username) {
            isTaken = true;
            break;
          }
        }
      }
      if (isTaken) {
        username = `${username}_${Math.floor(100 + Math.random() * 900)}`;
      }

      // SECURITY FIX (item 5): only the verified Google-authenticated email decides admin
      // status. `name`/`username` are user-editable profile fields and must never be part
      // of this check — see the comment in switchAccountPersona() for the exploit this closes.
      const isAdmin = isUserAdmin(email);
      const isPlusMember = false;
      const avatarUrl = customData.avatarUrl || user.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${email}`;
      const bio = customData.bio || (isAdmin ? "Official Platform Admin" : "Standard Collector");
      const socialIg = customData.socialIg || '';
      const socialTwitter = customData.socialTwitter || '';
      const socialTiktok = customData.socialTiktok || '';
      const socialWeb = customData.socialWeb || '';
      // A collector is only considered "onboarded" once they've been through
      // the Complete Your Profile popup (or dismissed it) at least once —
      // never re-derived from whether other fields happen to be filled in,
      // so re-logins never re-trigger it unexpectedly.
      const profileCompleted = !!customData.profileCompleted;

      currentUser = { name, username, email, isAdmin, isPlusMember, avatarUrl, bio, socialIg, socialTwitter, socialTiktok, socialWeb, uid: user.uid, profileCompleted };

      // uid is stored on the profile doc itself so any later edit path (self-
      // service, persona switch, or admin edit) can find its way back to the
      // matching "users/{uid}" doc to keep both collections in sync.
      const profilePayload = { name, username, avatarUrl, bio, isPlusMember, socialIg, socialTwitter, socialTiktok, socialWeb, uid: user.uid, profileCompleted };
      // The local cache is harmless to refresh unconditionally — it only
      // ever affects this device.
      localStorage.setItem(`profile_${email}`, JSON.stringify(profilePayload));
      setCookie(`profile_${email}`, profilePayload, 30);

      // BUGFIX: this used to write profilePayload back to Firestore on
      // *every* login, unconditionally. If the "profiles" fetch above had
      // failed or simply hadn't found this email yet (e.g. on a fresh
      // device with no local cache to fall back on), `customData` resolved
      // to {} and every field above silently fell back to a generated
      // default (email-prefix name, dicebear avatar, "Standard Collector"
      // bio) — and this write-back would then persist those defaults over
      // the collector's real profile, corrupting it for every device going
      // forward. Only write here when it's actually safe to:
      //   - the "profiles" fetch genuinely succeeded (so an empty result
      //     really does mean "no profile exists yet", not "couldn't check"), AND
      //   - either this is a real first-time profile (nothing existed for
      //     this email) or we're just patching a missing/changed uid onto
      //     an already-matching doc.
      // Routine logins where a profile already exists just use the loaded
      // data as-is and don't write anything back.
      const isNewProfile = !firestoreProfile;
      const needsUidPatch = firestoreProfile && firestoreProfile.uid !== user.uid;
      if (!profilesFetchFailed && (isNewProfile || needsUidPatch)) {
        try {
          await db.collection("profiles").doc(email).set(profilePayload, { merge: true });
        } catch (e) {
          console.warn('Error saving profile on login (username/name may not persist):', e);
        }
        await syncProfileToUsersDoc(user.uid, profilePayload);
      }

      startUserHeartbeat();
      closeAuthModal();
      renderAuthHeader();
      updateAllViews();
      loadUserInboxThreads();

      // First-ever login (or one where the popup was never completed/skipped
      // yet): ask the collector to confirm their display name, username, and
      // bio before they go on to use the marketplace.
      if (!profileCompleted) openCompleteProfileModal();
    }

    function openCompleteProfileModal() {
      if (!currentUser) return;
      document.getElementById('complete-profile-name-input').value = currentUser.name || '';
      document.getElementById('complete-profile-username-input').value = currentUser.username || '';
      document.getElementById('complete-profile-bio-input').value = currentUser.bio || '';
      document.getElementById('complete-profile-ig-input').value = currentUser.socialIg || '';
      document.getElementById('complete-profile-twitter-input').value = currentUser.socialTwitter || '';
      document.getElementById('complete-profile-tiktok-input').value = currentUser.socialTiktok || '';
      document.getElementById('complete-profile-web-input').value = currentUser.socialWeb || '';
      document.getElementById('complete-profile-avatar-preview').src = currentUser.avatarUrl || '';
      document.getElementById('complete-profile-modal').classList.remove('hidden');
    }

    function closeCompleteProfileModal() {
      document.getElementById('complete-profile-modal').classList.add('hidden');
    }

    // Marks the popup as handled (so it won't nag on future logins) without
    // requiring the collector to change anything right now.
    async function markProfileCompletedFlag() {
      if (!currentUser) return;
      currentUser.profileCompleted = true;
      try {
        // Write the full current snapshot (not just the flag) so a collector
        // who doesn't have a "profiles" doc yet gets one created with their
        // actual name/username/avatar/bio/socials, instead of a doc that
        // only contains `profileCompleted: true` and nothing else.
        await db.collection('profiles').doc(currentUser.email).set({
          name: currentUser.name, username: currentUser.username, avatarUrl: currentUser.avatarUrl,
          bio: currentUser.bio, isPlusMember: currentUser.isPlusMember, socialIg: currentUser.socialIg,
          socialTwitter: currentUser.socialTwitter, socialTiktok: currentUser.socialTiktok,
          socialWeb: currentUser.socialWeb, uid: currentUser.uid, profileCompleted: true
        }, { merge: true });
        const cached = JSON.parse(localStorage.getItem(`profile_${currentUser.email}`) || '{}');
        cached.profileCompleted = true;
        localStorage.setItem(`profile_${currentUser.email}`, JSON.stringify(cached));
        setCookie(`profile_${currentUser.email}`, cached, 30);
      } catch (e) {
        console.warn('Could not persist profileCompleted flag:', e);
      }
    }

    function skipCompleteProfile() {
      closeCompleteProfileModal();
      markProfileCompletedFlag();
    }

    async function submitCompleteProfile() {
      if (!currentUser) return;
      const newName = document.getElementById('complete-profile-name-input').value.trim() || currentUser.name;
      const rawUsername = document.getElementById('complete-profile-username-input').value.trim();
      const newUsername = rawUsername ? rawUsername.replace(/^@/, '').toLowerCase().replace(/\s+/g, '_') : (currentUser.username || newName.toLowerCase().replace(/\s+/g, '_'));
      const newBio = document.getElementById('complete-profile-bio-input').value.trim();
      const newSocialIg = document.getElementById('complete-profile-ig-input').value.trim();
      const newSocialTwitter = document.getElementById('complete-profile-twitter-input').value.trim();
      const newSocialTiktok = document.getElementById('complete-profile-tiktok-input').value.trim();
      const newSocialWeb = document.getElementById('complete-profile-web-input').value.trim();

      await loadCollectorProfiles();
      let isTaken = false;
      for (let emailKey in globalCollectorProfiles) {
        if (emailKey !== currentUser.email) {
          const p = globalCollectorProfiles[emailKey];
          if (p.username?.toLowerCase() === newUsername) { isTaken = true; break; }
        }
      }
      if (isTaken) return showToast(`Username @${newUsername} is already taken. Please choose a different one.`);

      currentUser.name = newName;
      currentUser.username = newUsername;
      currentUser.bio = newBio;
      currentUser.socialIg = newSocialIg;
      currentUser.socialTwitter = newSocialTwitter;
      currentUser.socialTiktok = newSocialTiktok;
      currentUser.socialWeb = newSocialWeb;
      currentUser.profileCompleted = true;

      const profilePayload = {
        name: newName, username: newUsername, avatarUrl: currentUser.avatarUrl, bio: newBio,
        isPlusMember: currentUser.isPlusMember, socialIg: newSocialIg, socialTwitter: newSocialTwitter,
        socialTiktok: newSocialTiktok, socialWeb: newSocialWeb, uid: currentUser.uid, profileCompleted: true
      };
      localStorage.setItem(`profile_${currentUser.email}`, JSON.stringify(profilePayload));
      setCookie(`profile_${currentUser.email}`, profilePayload, 30);

      try {
        await db.collection('profiles').doc(currentUser.email).set(profilePayload, { merge: true });
        await syncProfileToUsersDoc(currentUser.uid, profilePayload);
        await loadCollectorProfiles();
      } catch (e) {
        console.warn('Error saving completed profile:', e);
      }

      closeCompleteProfileModal();
      renderAuthHeader();
      updateAllViews();
      showToast(currentLanguage === 'ID' ? 'Profil disimpan. Selamat datang!' : 'Profile saved. Welcome aboard!');
    }

    async function logoutUser() {
      stopUserHeartbeat();
      if (postCommentsUnsubscribe) { postCommentsUnsubscribe(); postCommentsUnsubscribe = null; }
      openCommentsPostId = null;
      await auth.signOut();
      currentUser = null;
      renderAuthHeader();
      switchTab('home');
      await loadAppState();
      showToast('Logged out.');
    }

    function openProfileManagerModal() {
      if (!currentUser) return showToast('Please log in first.');
      document.getElementById('profile-edit-name-input').value = currentUser.name || '';
      document.getElementById('profile-edit-username-input').value = currentUser.username || '';
      document.getElementById('profile-edit-email-input').value = currentUser.email || '';
      document.getElementById('profile-edit-avatar-input').value = currentUser.avatarUrl || '';
      document.getElementById('profile-edit-bio-input').value = currentUser.bio || '';
      document.getElementById('profile-edit-ig-input').value = currentUser.socialIg || '';
      document.getElementById('profile-edit-twitter-input').value = currentUser.socialTwitter || '';
      document.getElementById('profile-edit-tiktok-input').value = currentUser.socialTiktok || '';
      document.getElementById('profile-edit-web-input').value = currentUser.socialWeb || '';
      document.getElementById('profile-modal-avatar-preview').src = currentUser.avatarUrl || '';

      document.getElementById('profile-manager-modal').classList.remove('hidden');
    }

    function closeProfileManagerModal() { document.getElementById('profile-manager-modal').classList.add('hidden'); }

    // Raw camera-phone photos, base64-encoded, routinely land at 2-6MB+ — well
    // past Firestore's 1MB-per-document limit. Every avatar upload used to
    // store the raw file as-is, so writes to the "profiles" collection could
    // silently exceed that limit and fail (see saveProfileChanges below, which
    // used to swallow the error and still claim success). Downscaling +
    // re-encoding here keeps avatars comfortably small so the sync actually
    // goes through.
    function compressImageToDataUrl(file, maxDimension = 256, quality = 0.82) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the selected file.'));
        reader.onload = (e) => {
          const img = new Image();
          img.onerror = () => reject(new Error('Could not load the selected image.'));
          img.onload = () => {
            let { width, height } = img;
            if (width > height && width > maxDimension) {
              height = Math.round(height * (maxDimension / width));
              width = maxDimension;
            } else if (height >= width && height > maxDimension) {
              width = Math.round(width * (maxDimension / height));
              height = maxDimension;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    async function handleProfileAvatarUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await compressImageToDataUrl(file, 256, 0.82);
        document.getElementById('profile-edit-avatar-input').value = dataUrl;
        document.getElementById('profile-modal-avatar-preview').src = dataUrl;
      } catch (e) {
        showToast('Could not process that image: ' + e.message);
      }
    }

    async function saveProfileChanges() {
      if (!currentUser) return;
      const newName = document.getElementById('profile-edit-name-input').value.trim() || currentUser.name;
      const rawUsername = document.getElementById('profile-edit-username-input').value.trim();
      const newUsername = rawUsername ? rawUsername.replace(/^@/, '').toLowerCase().replace(/\s+/g, '_') : (currentUser.username || newName.toLowerCase().replace(/\s+/g, '_'));

      await loadCollectorProfiles();
      let isTaken = false;
      for (let emailKey in globalCollectorProfiles) {
        if (emailKey !== currentUser.email) {
          const p = globalCollectorProfiles[emailKey];
          if (p.username?.toLowerCase() === newUsername) {
            isTaken = true;
            break;
          }
        }
      }

      if (isTaken) {
        return showToast(`Username @${newUsername} is already taken by another account. Please choose a different username.`);
      }

      const newAvatar = document.getElementById('profile-edit-avatar-input').value.trim() || currentUser.avatarUrl;
      const newBio = document.getElementById('profile-edit-bio-input').value.trim();
      const newIg = document.getElementById('profile-edit-ig-input').value.trim();
      const newTwitter = document.getElementById('profile-edit-twitter-input').value.trim();
      const newTiktok = document.getElementById('profile-edit-tiktok-input').value.trim();
      const newWeb = document.getElementById('profile-edit-web-input').value.trim();

      currentUser.name = newName;
      currentUser.username = newUsername;
      currentUser.avatarUrl = newAvatar;
      currentUser.bio = newBio;
      currentUser.socialIg = newIg;
      currentUser.socialTwitter = newTwitter;
      currentUser.socialTiktok = newTiktok;
      currentUser.socialWeb = newWeb;
      // SECURITY FIX (item 5): editing your display name/username must never change your
      // admin status. Admin status is fixed to the authenticated email for the session.
      currentUser.isAdmin = isUserAdmin(currentUser.email);

      const profilePayload = { name: newName, username: newUsername, avatarUrl: newAvatar, bio: newBio, isPlusMember: false, socialIg: newIg, socialTwitter: newTwitter, socialTiktok: newTiktok, socialWeb: newWeb, uid: currentUser.uid || null };
      localStorage.setItem(`profile_${currentUser.email}`, JSON.stringify(profilePayload));
      setCookie(`profile_${currentUser.email}`, profilePayload, 30);

      try {
        await db.collection("profiles").doc(currentUser.email).set(profilePayload, { merge: true });
        await syncProfileToUsersDoc(currentUser.uid, profilePayload);
        await loadCollectorProfiles();

        closeProfileManagerModal();
        renderAuthHeader();
        updateAllViews();
        showToast('Profile and unique username updated!');
        addNotification('Profile Updated', `Your unique username (@${newUsername}) and profile details were saved.`, 'fa-user-gear text-amber-400');
      } catch (e) {
        // Previously this catch block was empty, so a failed sync (e.g. an
        // oversized avatar pushing the document past Firestore's 1MB limit)
        // still showed "Profile updated!" — the change looked saved locally
        // but never reached other viewers. Now we're honest about it.
        closeProfileManagerModal();
        renderAuthHeader();
        updateAllViews();
        showToast('Saved on this device, but syncing to the server failed: ' + e.message + '. Other collectors may not see this update yet — try again or use a smaller photo.');
      }
    }

    // ===== 3D TILT + HOLOGRAPHIC POINTER TRACKING (item 6) =====
    // Event-delegated so it keeps working after renderCardGrid()/renderOwnedCards() re-render innerHTML.
    function setupCardTiltEffect() {
      const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (isTouch || prefersReducedMotion) return; // keep the simple CSS hover/tap state on touch devices

      const tiltTargets = '.card-holo-premium, .card-holo-standard';

      document.addEventListener('mousemove', (e) => {
        const el = e.target.closest(tiltTargets);
        document.querySelectorAll(tiltTargets).forEach(card => {
          if (card !== el) {
            card.style.transform = '';
            card.style.setProperty('--holo-x', '50%');
            card.style.setProperty('--holo-y', '50%');
          }
        });
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const rotateY = (px - 0.5) * 14;
        const rotateX = (0.5 - py) * 14;

        el.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px) scale(1.02)`;
        el.style.setProperty('--holo-x', `${px * 100}%`);
        el.style.setProperty('--holo-y', `${py * 100}%`);
      });

      document.addEventListener('mouseleave', (e) => {
        const el = e.target.closest && e.target.closest(tiltTargets);
        if (el) el.style.transform = '';
      }, true);
    }


    function formatCompactIDR(value) {
      const n = Number(value || 0);
      if (n >= 1000000000) return `Rp ${(n/1000000000).toFixed(1)}B`;
      if (n >= 1000000) return `Rp ${(n/1000000).toFixed(1)}M`;
      if (n >= 1000) return `Rp ${(n/1000).toFixed(0)}K`;
      return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
    }

    function getMarketMetrics() {
      const prices = inventory.map(c => Number(c.price || 0)).filter(v => v > 0).sort((a,b)=>a-b);
      const available = inventory.filter(c => String(c.status || 'AVAILABLE').toUpperCase() === 'AVAILABLE');
      const sold = inventory.filter(c => String(c.status || '').toUpperCase() === 'SOLD');
      const approvedSales = transactionsList.filter(tx => tx.status === 'APPROVED' && Array.isArray(tx.items));
      const sales = [];
      approvedSales.forEach(tx => (tx.items || []).forEach(item => {
        const card = inventory.find(c => c.id === item.id);
        const price = Number(item.price || card?.price || 0);
        if (price > 0) sales.push({ price, date: tx.created_at || null, id: tx.id || 'SALE' });
      }));
      const floor = available.length ? Math.min(...available.map(c=>Number(c.price||0)).filter(v=>v>0)) : (prices[0] || 0);
      const avg = prices.length ? prices.reduce((a,b)=>a+b,0)/prices.length : 0;
      const median = prices.length ? prices[Math.floor(prices.length/2)] : 0;
      const topSale = sales.length ? Math.max(...sales.map(s=>s.price)) : (sold.length ? Math.max(...sold.map(c=>Number(c.price||0))) : 0);
      return { floor, avg, median, topSale, available:available.length, sold:sold.length, sales };
    }

    function renderMarketIntelligence() {
      const statGrid = document.getElementById('market-stat-grid');
      const bars = document.getElementById('market-sales-bars');
      const context = document.getElementById('market-price-context');
      if (!statGrid && !bars && !context) return;

      const m = getMarketMetrics();
      const stats = [
        [tr('marketFloorPrice','Floor Price'), formatCompactIDR(m.floor), tr('lowestCurrentlyAvailable','Lowest currently available'), ''],
        [tr('marketAveragePrice','Average Price'), formatCompactIDR(m.avg), `${inventory.length} ${tr('cardsTracked','cards tracked')}`, 'purple'],
        [tr('marketMedianPrice','Median Price'), formatCompactIDR(m.median), tr('middleCurrentCatalog','Middle of current catalog'), 'gold'],
        [tr('marketTopSale','Top Sale'), formatCompactIDR(m.topSale), m.sales.length ? tr('highestApprovedSale','Highest approved sale') : tr('highestRecordedCardValue','Highest recorded card value'), 'positive'],
        [tr('marketLiquidity','Liquidity'), `${m.available}/${inventory.length || 0}`, `${m.sold} ${tr('distributedSold','distributed / sold')}`, 'positive']
      ];

      if (statGrid) {
        statGrid.innerHTML = stats.map(s =>
          `<div class="market-stat ${s[3]}"><div class="label">${s[0]}</div><div class="value">${s[1]}</div><div class="sub">${s[2]}</div></div>`
        ).join('');
      }

      const recent = m.sales.slice().sort((a,b)=>new Date(a.date||0)-new Date(b.date||0)).slice(-8);
      if (bars) {
        if (!recent.length) {
          bars.innerHTML = `<div class="h-full w-full flex items-center justify-center text-[9px] text-slate-600">${tr('approvedSalesWillAppear','Approved sales will appear here as the marketplace grows.')}</div>`;
        } else {
          const max = Math.max(...recent.map(s=>s.price),1);
          bars.innerHTML = recent.map(s =>
            `<div class="market-sale-bar" title="${formatIDR(s.price)}"><div class="bar" style="height:${Math.max(8,(s.price/max)*82)}%"></div><span>${formatCompactIDR(s.price)}</span></div>`
          ).join('');
        }
      }

      const maxContext = Math.max(m.topSale,m.floor,m.avg,1);
      if (context) {
        context.innerHTML = [
          [tr('marketFloorPrice','Floor'),m.floor],
          [tr('marketMedianPrice','Median'),m.median],
          [tr('marketAveragePrice','Average'),m.avg],
          [tr('marketTopSale','Top Sale'),m.topSale]
        ].map(([label,val]) =>
          `<div class="market-context-row"><div class="w-full"><div class="flex items-center justify-between"><span class="meta">${label}</span><strong>${formatCompactIDR(val)}</strong></div><div class="market-context-track"><div class="market-context-fill" style="width:${Math.max(3,Math.min(100,(val/maxContext)*100))}%"></div></div></div></div>`
        ).join('');
      }

      const saleCount = document.getElementById('market-sale-count');
      if (saleCount) saleCount.textContent = `${m.sales.length} ${tr('approvedSales','approved sales')}`;

      const volume = m.sales.reduce((a,s)=>a+s.price,0);
      const heroVolume = document.getElementById('hero-stat-volume');
      if (heroVolume) heroVolume.textContent = formatCompactIDR(volume);

      const remaining = document.getElementById('remaining-cards-count');
      if (remaining) remaining.textContent = m.available;
    }

    function renderCollectorReputationPanel() {
      const panel = document.getElementById('collector-reputation-panel');
      if (!panel || !currentUser) return;

      panel.classList.remove('hidden');

      const profile = getCollectorProfile(currentUser.email || currentUser.uid) || {};
      const name = profile.name || currentUser.displayName || currentUser.email?.split('@')[0] || tr('collectorFallback','Collector');
      const owned = inventory.filter(c => c.owner && String(c.owner).toLowerCase() === String(name).toLowerCase()).length;
      const trades = tradeRequestsList.filter(t =>
        String(t.from || '').toLowerCase() === String(name).toLowerCase() ||
        String(t.to || '').toLowerCase() === String(name).toLowerCase()
      ).length;

      const badges = Math.min(8, Math.floor(owned/2) + Math.floor(trades/3));
      const reputation = Math.min(100, Math.max(70, 85 + owned*2 + trades*2));

      const n = document.getElementById('collector-reputation-name');
      if (n) n.textContent = name;

      const s = document.getElementById('collector-reputation-sub');
      if (s) s.textContent = `${owned} ${tr('collectedSuffix','collected')} • ${tr('reputationGrowthHint','Reputation grows with verified marketplace activity.')}`;

      const score = document.getElementById('collector-reputation-score');
      if (score) score.textContent = reputation;

      const trEl = document.getElementById('collector-reputation-trades');
      if (trEl) trEl.textContent = trades;

      const bc = document.getElementById('collector-reputation-badges');
      if (bc) bc.textContent = badges;

      const row = document.getElementById('collector-achievements-row');
      if (row) {
        const achievements = [
          ['fa-id-card','achievementFirstCollector',owned >= 1],
          ['fa-gem','achievementPremiumHunter',inventory.some(c => c.owner && String(c.owner).toLowerCase() === String(name).toLowerCase() && c.type === 'PREMIUM')],
          ['fa-handshake','achievementTrader',trades >= 1],
          ['fa-fire','achievementActiveCollector',owned >= 3],
          ['fa-crown','achievementVaultBuilder',owned >= 5]
        ];
        row.innerHTML = achievements.map(a =>
          `<span class="achievement-chip ${a[2] ? '' : 'locked'}"><i class="fa-solid ${a[0]}"></i>${tr(a[1], a[1])}</span>`
        ).join('');
      }
    }

    function getCatalogFilteredCards() {
      const searchVal = (document.getElementById('search-input')?.value || '').trim().toLowerCase();

      const filtered = inventory.filter(card => {
        const matchesFilter = currentFilter === 'ALL' ? true : card.type === currentFilter;
        const matchesSearch =
          !searchVal ||
          (card.serial || '').toLowerCase().includes(searchVal) ||
          (card.name || '').toLowerCase().includes(searchVal) ||
          (card.owner || '').toLowerCase().includes(searchVal);

        return matchesFilter && matchesSearch;
      });

      return filtered.sort((a, b) => {
        switch (catalogSortMode) {
          case 'PRICE_DESC': return Number(b.price || 0) - Number(a.price || 0);
          case 'PRICE_ASC': return Number(a.price || 0) - Number(b.price || 0);
          case 'NAME': return String(a.name || '').localeCompare(String(b.name || ''));
          case 'STATUS':
            return String(a.status || '').localeCompare(String(b.status || ''));
          default:
            return String(a.id || a.serial || '').localeCompare(String(b.id || b.serial || ''), undefined, { numeric: true });
        }
      });
    }

    function setCatalogSort(mode) {
      catalogSortMode = mode || 'SERIAL';
      visibleCardCount = 10;
      renderCardGrid();
    }

    function loadCatalogViewPreference() {
      try { catalogViewMode = localStorage.getItem('eugene_catalog_view') === 'LIST' ? 'LIST' : 'GRID'; } catch (e) { catalogViewMode = 'GRID'; }
    }

    function setCatalogViewMode(mode) {
      catalogViewMode = mode === 'LIST' ? 'LIST' : 'GRID';

      const grid = document.getElementById('card-grid');
      const gridBtn = document.getElementById('catalog-grid-view-btn');
      const listBtn = document.getElementById('catalog-list-view-btn');

      if (grid) {
        grid.className = catalogViewMode === 'LIST'
          ? 'catalog-card-list'
          : 'catalog-card-grid';
      }
      gridBtn?.classList.toggle('active', catalogViewMode === 'GRID');
      listBtn?.classList.toggle('active', catalogViewMode === 'LIST');

      try { localStorage.setItem('eugene_catalog_view', catalogViewMode); } catch (e) {}
      renderCardGrid();
    }

    loadCatalogViewPreference();

    function renderCatalogCard(card, index) {
      const isPremium = card.type === 'PREMIUM';
      const isSold = card.status === 'SOLD';
      const isWishlisted = wishlist.has(card.id);
      const status = String(card.status || 'AVAILABLE').toUpperCase();
      const statusAvailable = !isSold && status === 'AVAILABLE';

      if (catalogViewMode === 'LIST') {
        return `
          <article class="catalog-list-card ${isPremium ? 'premium' : 'standard'}" onclick="openCardDetailModal('${card.id}')">
            <div class="catalog-list-media">
              <img src="${card.imgUrl}" loading="lazy" alt="${card.name || 'Eugene Card'}">
              <span class="catalog-type-pill ${isPremium ? 'premium' : 'standard'}">${isPremium ? 'PREMIUM' : 'STANDARD'}</span>
            </div>
            <div class="catalog-list-main">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="catalog-list-serial">${card.serial || '—'}</p>
                  <h4>${card.name || 'Unnamed Card'}</h4>
                  <p>${card.edition || 'Beta Edition'}</p>
                </div>
                <button onclick="event.stopPropagation(); toggleWishlist('${card.id}')" class="catalog-heart ${isWishlisted ? 'active' : ''}" title="Wishlist">
                  <i class="fa-solid fa-heart"></i>
                </button>
              </div>
              <div class="catalog-list-meta">
                <span><i class="fa-solid fa-user"></i>${card.owner || 'Unowned'}</span>
                <span class="${statusAvailable ? 'available' : 'sold'}"><i class="fa-solid fa-circle"></i>${status}</span>
              </div>
            </div>
            <div class="catalog-list-price">
              <span>Market Price</span>
              <strong>${formatIDR(card.price || 0)}</strong>
              ${statusAvailable
                ? `<button onclick="event.stopPropagation(); addToCart('${card.id}')" class="catalog-buy-btn">Add to Cart</button>`
                : `<button disabled class="catalog-buy-btn disabled">${isSold ? 'Owned / Sold' : status}</button>`}
            </div>
          </article>
        `;
      }

      return `
        <article class="catalog-card ${isPremium ? 'premium' : 'standard'}" onclick="openCardDetailModal('${card.id}')">
          <div class="catalog-card-glow"></div>
          <div class="catalog-card-top">
            <span class="catalog-type-pill ${isPremium ? 'premium' : 'standard'}">
              ${isPremium ? '<i class="fa-solid fa-gem"></i>' : '<i class="fa-solid fa-circle"></i>'}
              ${card.type || 'STANDARD'}
            </span>
            <button onclick="event.stopPropagation(); toggleWishlist('${card.id}')" class="catalog-heart ${isWishlisted ? 'active' : ''}" title="Wishlist">
              <i class="fa-solid fa-heart"></i>
            </button>
          </div>

          <div class="catalog-card-image">
            <div class="catalog-card-image-inner">
              <img src="${card.imgUrl}" loading="lazy" alt="${card.name || 'Eugene Card'}">
            </div>
            ${isPremium ? '<div class="catalog-foil"></div>' : ''}
            <div class="catalog-image-shine"></div>
            <span class="catalog-serial-badge">${card.serial || '—'}</span>
          </div>

          <div class="catalog-card-content">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="catalog-card-edition">${card.edition || 'Beta Edition'}</p>
                <h4 class="truncate">${card.name || 'Unnamed Card'}</h4>
              </div>
              <span class="catalog-status-dot ${statusAvailable ? 'available' : 'sold'}" title="${status}"></span>
            </div>

            <div class="catalog-card-divider"></div>

            <div class="flex items-end justify-between gap-2">
              <div>
                <p class="catalog-price-label">Market Price</p>
                <p class="catalog-price">${formatIDR(card.price || 0)}</p>
              </div>
              <div class="text-right max-w-[95px]">
                <p class="catalog-price-label">Holder</p>
                <p class="text-[10px] text-slate-400 truncate">${card.owner || 'House'}</p>
              </div>
            </div>

            ${statusAvailable
              ? `<button onclick="event.stopPropagation(); addToCart('${card.id}')" class="catalog-buy-btn w-full mt-3"><i class="fa-solid fa-cart-plus"></i> ${i18nDict[currentLanguage].btnAddToCart}</button>`
              : `<button disabled class="catalog-buy-btn disabled w-full mt-3"><i class="fa-solid fa-lock"></i> ${i18nDict[currentLanguage].btnOwned}</button>`}
          </div>
        </article>
      `;
    }

    
    function updateCatalogSupplyRing() {
      const ring = document.getElementById('catalog-supply-progress');
      if (!ring) return;
      const available = inventory.filter(c => String(c.status || 'AVAILABLE').toUpperCase() !== 'SOLD').length;
      const pct = Math.max(0, Math.min(100, (available / 50) * 100));
      ring.style.strokeDasharray = `${pct} ${100 - pct}`;
      ring.style.strokeDashoffset = '0';
    }

    function renderCardGrid() {
      const grid = document.getElementById('card-grid');
      if (!grid) return;

      updateCatalogSupplyRing();
      renderMarketIntelligence();
      const filtered = getCatalogFilteredCards();
      const countEl = document.getElementById('catalog-result-count');
      if (countEl) countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'card' : 'cards'}`;

      if (catalogViewMode === 'LIST') grid.className = 'catalog-card-list';
      else grid.className = 'catalog-card-grid';

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="catalog-empty-state">
            <div class="catalog-empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
            <h4>No cards found</h4>
            <p>Try another serial, card name, or filter.</p>
            <button onclick="document.getElementById('search-input').value=''; setFilter('ALL')" class="catalog-secondary-btn mt-4">Clear filters</button>
          </div>`;
        return;
      }

      const visibleCards = filtered.slice(0, visibleCardCount);
      grid.innerHTML = visibleCards.map(renderCatalogCard).join('');

      if (visibleCardCount < filtered.length) {
        grid.innerHTML += `
          <div id="scroll-sentinel" class="${catalogViewMode === 'LIST' ? 'catalog-list-sentinel' : 'catalog-grid-sentinel'}">
            <span class="catalog-loading-dot"></span>
            Loading more cards...
          </div>`;
        setupScrollSentinel(filtered.length);
      }
    }

    function setupScrollSentinel(totalFilteredLength) {
      if (scrollObserver) scrollObserver.disconnect();

      const sentinel = document.getElementById('scroll-sentinel');
      if (!sentinel) return;

      scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          if (visibleCardCount < totalFilteredLength) {
            visibleCardCount += CARDS_PER_BATCH;
            renderCardGrid();
          }
        }
      }, { rootMargin: '100px' });

      scrollObserver.observe(sentinel);
    }

    function setFilter(type) {
      currentFilter = type;
      visibleCardCount = 10;

      ['ALL', 'PREMIUM', 'STANDARD'].forEach(f => {
        const btn = document.getElementById(`filter-${f}`);
        if (!btn) return;
        btn.classList.toggle('active', f === type);
      });

      renderCardGrid();
    }

    async function fetchTransactionHistory() {
      try {
        const snapshot = await db.collection("transactions").orderBy("created_at", "desc").get();
        const txList = [];
        snapshot.forEach(doc => txList.push({ id: doc.id, ...doc.data() }));
        transactionsList = txList;
        renderTransactionHistoryTable();
        renderHomepageHighlights();
      } catch (e) {
        console.warn('Error fetching transactions:', e);
      }
    }

    function setHistoryFilter(type) {
      historyFilter = type;
      ['ALL', 'MINE', 'APPROVED'].forEach(f => {
        const btn = document.getElementById(`history-filter-${f}`);
        if (btn) btn.className = f === type ? 'px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 transition-all' : 'px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 hover:text-white transition-all';
      });
      renderTransactionHistoryTable();
    }

    function renderTransactionHistoryTable() {
      const tbody = document.getElementById('history-table-body');
      if (!tbody) return;

      const filtered = transactionsList.filter(tx => {
        if (historyFilter === 'MINE') {
          if (!currentUser) return false;
          const myName = (currentUser.name || '').trim().toLowerCase();
          const myUsername = (currentUser.username || '').trim().toLowerCase();
          const myEmailName = (currentUser.email ? currentUser.email.split('@')[0] : '').trim().toLowerCase();
          const txUser = (tx.user_name || '').trim().toLowerCase();
          return txUser === myName || txUser === myUsername || (myEmailName && txUser === myEmailName);
        }
        if (historyFilter === 'APPROVED') return tx.status === 'APPROVED';
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No transaction records found.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(tx => {
        let items = Array.isArray(tx.items) ? tx.items : [];
        const itemsFormatted = items.length > 0 
          ? items.map(i => `<span class="inline-block bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[10px] font-mono text-amber-400 mr-1 mb-1">${i.serial || 'Card'}</span>`).join('')
          : '<span class="text-slate-500">N/A</span>';

        let badgeClass = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        if (tx.status === 'APPROVED') badgeClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
        if (tx.status === 'REJECTED') badgeClass = 'bg-rose-500/20 text-rose-400 border-rose-500/30';

        if (tx.qrisProofUrl) proofUrlById[tx.id] = tx.qrisProofUrl;
        const proofBtn = tx.qrisProofUrl 
          ? `<button type="button" onclick="viewTransactionProof('${tx.id}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 text-[10px] font-bold rounded-lg border border-slate-700 inline-flex items-center gap-1"><i class="fa-solid fa-image"></i> View Receipt</button>`
          : `<span class="text-slate-600 text-[10px]">No File</span>`;

        const methodBadge = tx.paymentMethod === 'PAYPAL'
          ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 ml-1">PAYPAL</span>`
          : `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 ml-1">QRIS</span>`;

        return `
          <tr class="hover:bg-slate-950/60 transition-colors">
            <td class="p-3.5 font-mono font-extrabold text-indigo-400">${tx.id || 'ORD-000'} ${methodBadge}</td>
            <td class="p-3.5 font-bold text-white">${tx.user_name || 'Guest'}</td>
            <td class="p-3.5">${itemsFormatted}</td>
            <td class="p-3.5 font-mono text-emerald-400 font-extrabold">${formatIDR(tx.total_amount || 0)} <span class="text-[9px] text-amber-400 block font-normal">Includes 2% Tax</span></td>
            <td class="p-3.5">${proofBtn}</td>
            <td class="p-3.5"><span class="text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${badgeClass}">${tx.status || 'PENDING'}</span></td>
            <td class="p-3.5 text-right font-mono text-[10px] text-slate-400">${tx.created_at ? new Date(tx.created_at).toLocaleDateString() : 'Recently'}</td>
          </tr>
        `;
      }).join('');
    }

    function renderInventoryTable() {
      const tbody = document.getElementById('inventory-table-body');
      if (!tbody) return;

      const searchVal = (document.getElementById('inventory-search')?.value || '').toLowerCase();
      const filtered = inventory.filter(c => (c.serial || '').toLowerCase().includes(searchVal) || (c.name || '').toLowerCase().includes(searchVal) || (c.owner && c.owner.toLowerCase().includes(searchVal)));

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-500">No cards found.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(card => `
        <tr class="hover:bg-slate-950/60 transition-colors">
          <td class="p-3 font-mono font-bold text-amber-400">${card.serial}</td>
          <td class="p-3 font-bold text-white">${card.name}</td>
          <td class="p-3 text-[10px] font-extrabold ${card.type === 'PREMIUM' ? 'text-amber-400' : 'text-blue-400'}">${card.type}</td>
          <td class="p-3 font-mono text-emerald-400 font-bold">${formatIDR(card.price)}</td>
          <td class="p-3 text-slate-300">${card.owner || 'Unowned (House)'}</td>
          <td class="p-3"><span class="text-[9px] font-bold px-2 py-0.5 rounded ${card.status === 'SOLD' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}">${card.status}</span></td>
          <td class="p-3 text-right">
            <button onclick="openInventoryModal('${card.id}')" class="px-2.5 py-1 bg-slate-800 text-amber-400 font-bold text-[10px] rounded-lg border border-slate-700 hover:bg-slate-700 transition-all">Edit Details</button>
          </td>
        </tr>
      `).join('');
    }

    function toggleOwnerDropdown() {
      const menu = document.getElementById('owner-dropdown-menu');
      if (!menu) return;
      if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        document.getElementById('owner-search-input').value = '';
        filterOwnerOptions();
        document.getElementById('owner-search-input').focus();
      } else {
        menu.classList.add('hidden');
      }
    }

    function filterOwnerOptions() {
      const query = (document.getElementById('owner-search-input')?.value || '').toLowerCase();
      const listContainer = document.getElementById('owner-dropdown-list');
      const selectedVal = document.getElementById('edit-card-owner-select').value;
      const filtered = ownerOptionsList.filter(item => item.label.toLowerCase().includes(query));

      if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="p-3 text-center text-slate-500 text-[11px]">No matching collectors</div>`;
        return;
      }

      listContainer.innerHTML = filtered.map(item => `
        <div onclick="selectOwnerOption('${item.value}', '${item.label}')" class="px-3 py-2 text-xs text-slate-200 hover:bg-amber-500 hover:text-slate-950 cursor-pointer flex justify-between items-center transition-colors ${selectedVal === item.value ? 'font-bold bg-slate-900 text-amber-400' : ''}">
          <span>${item.label}</span>
          ${selectedVal === item.value ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
        </div>
      `).join('');
    }

    function selectOwnerOption(value, label) {
      document.getElementById('edit-card-owner-select').value = value;
      document.getElementById('owner-dropdown-label').innerText = label;
      document.getElementById('owner-dropdown-menu').classList.add('hidden');
    }

    function toggleTradeCardDropdown() {
      const menu = document.getElementById('trade-dropdown-menu');
      if (!menu) return;
      if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        document.getElementById('trade-search-input').value = '';
        filterTradeCardOptions();
        document.getElementById('trade-search-input').focus();
      } else {
        menu.classList.add('hidden');
      }
    }

    function filterTradeCardOptions() {
      const query = (document.getElementById('trade-search-input')?.value || '').toLowerCase();
      const listContainer = document.getElementById('trade-dropdown-list');
      const selectedVal = document.getElementById('trade-req-card-id').value;
      const filtered = tradeCardOptionsList.filter(item => item.searchText.includes(query));

      if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="p-3 text-center text-slate-500 text-[11px]">No matching cards found</div>`;
        return;
      }

      listContainer.innerHTML = filtered.map(item => `
        <div onclick="selectTradeCardOption('${item.value}', '${item.label}')" class="px-3 py-2 text-xs text-slate-200 hover:bg-purple-600 hover:text-white cursor-pointer flex justify-between items-center transition-colors ${selectedVal === item.value ? 'font-bold bg-slate-900 text-purple-400' : ''}">
          <span>${item.label}</span>
          ${selectedVal === item.value ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
        </div>
      `).join('');
    }

    function selectTradeCardOption(value, label) {
      document.getElementById('trade-req-card-id').value = value;
      document.getElementById('trade-dropdown-label').innerText = label;
      document.getElementById('trade-dropdown-menu').classList.add('hidden');
    }

    function openInventoryModal(cardId) {
      const card = inventory.find(c => c.id === cardId);
      if (!card) return;

      document.getElementById('edit-card-id').value = card.id;
      document.getElementById('edit-card-name').value = card.name;
      document.getElementById('edit-card-serial').value = card.serial;
      document.getElementById('edit-card-type').value = card.type;
      document.getElementById('edit-card-price').value = card.price;
      document.getElementById('edit-card-status').value = card.status;
      document.getElementById('edit-card-img').value = card.imgUrl;
      document.getElementById('edit-card-file-input').value = '';

      document.getElementById('edit-card-edition').value = card.edition || "Beta Edition: #0";
      document.getElementById('edit-card-sn').value = card.sn || "0001";
      document.getElementById('edit-card-tier').value = card.tier || (card.type === 'PREMIUM' ? "500" : "100");
      document.getElementById('edit-card-printing').value = card.printing || "1x";

      const ownersSet = new Set();
      inventory.forEach(c => { if (c.owner) ownersSet.add(c.owner); });
      if (currentUser?.name) ownersSet.add(currentUser.name);
      if (currentUser?.username) ownersSet.add(currentUser.username);

      const currentCardOwner = card.owner || '';
      ownerOptionsList = [{ value: '', label: i18nDict[currentLanguage].unownedHouse }];
      ownersSet.forEach(ownerName => ownerOptionsList.push({ value: ownerName, label: ownerName }));

      const matched = ownerOptionsList.find(o => o.value === currentCardOwner);
      selectOwnerOption(currentCardOwner, matched ? matched.label : (currentCardOwner || i18nDict[currentLanguage].unownedHouse));

      document.getElementById('inventory-edit-modal').classList.remove('hidden');
    }

    function closeInventoryModal() { 
      document.getElementById('inventory-edit-modal').classList.add('hidden'); 
      document.getElementById('owner-dropdown-menu')?.classList.add('hidden');
    }

    function handleImageFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('edit-card-img').value = e.target.result;
        showToast('Image loaded!');
      };
      reader.readAsDataURL(file);
    }

    async function saveInventoryCardChanges() {
      if (!currentUser?.isAdmin) return showToast('Admin permission required.');

      const cardId = document.getElementById('edit-card-id').value;
      const card = inventory.find(c => c.id === cardId);
      if (!card) return;

      const updatedName = document.getElementById('edit-card-name').value;
      const updatedSerial = document.getElementById('edit-card-serial').value;
      const updatedType = document.getElementById('edit-card-type').value;
      const updatedPrice = parseFloat(document.getElementById('edit-card-price').value) || card.price;
      const updatedStatus = document.getElementById('edit-card-status').value;
      
      const updatedEdition = document.getElementById('edit-card-edition').value.trim() || "Beta Edition: #0";
      const updatedSn = document.getElementById('edit-card-sn').value.trim() || "0001";
      const updatedTier = document.getElementById('edit-card-tier').value.trim() || (updatedType === 'PREMIUM' ? "500" : "100");
      const updatedPrinting = document.getElementById('edit-card-printing').value.trim() || "1x";

      const ownerSelectVal = document.getElementById('edit-card-owner-select').value;
      const updatedOwner = ownerSelectVal === '' ? null : ownerSelectVal;
      const finalStatus = updatedOwner ? 'SOLD' : updatedStatus;
      const updatedImgUrl = document.getElementById('edit-card-img').value;

      const updatedObj = {
        id: cardId,
        name: updatedName,
        serial: updatedSerial,
        type: updatedType,
        price: updatedPrice,
        status: finalStatus,
        owner: updatedOwner,
        imgUrl: updatedImgUrl,
        edition: updatedEdition,
        sn: updatedSn,
        tier: updatedTier,
        printing: updatedPrinting
      };

      try {
        await db.collection("cards").doc(cardId).set(updatedObj, { merge: true });
        Object.assign(card, updatedObj);
        showToast(`Saved ${updatedSerial} to Firestore!`);
      } catch (e) {
        console.error('Firestore DB write error:', e);
        showToast('Error saving to Firestore: ' + e.message);
      }

      closeInventoryModal();
      updateAllViews();
      addNotification('Card Updated', `Modified specifications for ${updatedSerial} (${updatedName}).`, 'fa-pen-to-square text-amber-400');
    }

    function openCardDetailModal(cardId) {
      const card = inventory.find(c => c.id === cardId);
      if (!card) return;

      activeDetailCardId = cardId;

      document.getElementById('detail-card-title').innerText = card.name;
      document.getElementById('detail-card-serial').innerText = card.serial;
      const isPremiumDetail = card.type === 'PREMIUM';
      const rarityDetail = getRarityBreakdown(card);
      const seriesSize = Math.max(1, Number(card.seriesSize || inventory.length || 50));
      const serialNumDetail = parseInt((card.sn || card.serial || '1').replace(/\D/g, ''), 10) || 1;
      const soldCountDetail = inventory.filter(c => String(c.status || 'AVAILABLE').toUpperCase() === 'SOLD').length;
      const scarcityLabel = serialNumDetail <= 5 ? (currentLanguage === 'ID' ? 'Serial awal • sangat dicari' : 'Early serial • highly scarce') : (isPremiumDetail ? (currentLanguage === 'ID' ? 'Edisi premium terbatas' : 'Limited premium edition') : (currentLanguage === 'ID' ? 'Edisi standar terbatas' : 'Limited standard edition'));

      const badge = document.getElementById('detail-card-edition-badge');
      badge.innerText = isPremiumDetail ? 'PREMIUM' : 'STANDARD';
      badge.className = `card-detail-badge ${isPremiumDetail ? 'premium' : 'standard'}`;
      const typeLabel = document.getElementById('detail-card-type-label');
      if (typeLabel) { typeLabel.innerText = card.type || 'STANDARD'; }
      const art = document.getElementById('detail-card-art');
      if (art) art.classList.toggle('premium', isPremiumDetail);
      const foil = document.getElementById('detail-card-foil');
      if (foil) foil.classList.toggle('hidden', !isPremiumDetail);
      document.getElementById('detail-card-rarity').innerText = `${rarityDetail.score}/100`;
      document.getElementById('detail-card-rarity-label').innerText = rarityDetail.score >= 90 ? 'Exceptional' : rarityDetail.score >= 80 ? 'Very Rare' : rarityDetail.score >= 70 ? 'Rare' : 'Collector';
      document.getElementById('detail-card-rarity-bar').style.width = `${rarityDetail.score}%`;
      document.getElementById('detail-card-scarcity').innerText = scarcityLabel;
      document.getElementById('detail-card-series-size').innerText = `${seriesSize} ${currentLanguage === 'ID' ? 'copy' : 'copies'} • ${soldCountDetail} ${currentLanguage === 'ID' ? 'terdistribusi' : 'distributed'}`;
      document.getElementById('detail-card-id').innerText = card.id || card.serial || '—';
      document.getElementById('detail-card-owner-info').innerText = card.owner || 'Unowned';
      
      const imgEl = document.getElementById('detail-card-img');
      imgEl.src = card.imgUrl;

      document.getElementById('detail-card-owner').innerText = card.owner || 'Unowned';
      document.getElementById('detail-card-price').innerText = formatIDR(card.price);
      document.getElementById('detail-card-status').innerText = card.status;

      document.getElementById('detail-card-edition-text').innerText = card.edition || "Beta Edition: #0";
      document.getElementById('detail-card-sn-text').innerText = card.sn || "0001";
      document.getElementById('detail-card-tier-text').innerText = card.tier || (card.type === 'PREMIUM' ? "500" : "100");
      document.getElementById('detail-card-printing-text').innerText = card.printing || "1x";

      const container = document.getElementById('detail-card-action-container');
      if (card.status === 'AVAILABLE') {
        container.innerHTML = `<button onclick="addToCart('${card.id}'); closeCardDetailModal();" class="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl transition-all">${currentLanguage === 'ID' ? 'Tambah Kartu ke Keranjang' : 'Add Card to Cart'}</button>`;
      } else {
        container.innerHTML = `<button disabled class="w-full py-2.5 bg-slate-950 text-slate-600 font-bold text-xs rounded-xl cursor-not-allowed">${currentLanguage === 'ID' ? 'Sudah Dimiliki' : 'Already Owned'}</button>`;
      }

      marketProfilePanelOpen = false;
      const panel = document.getElementById('card-market-profile-panel');
      const chevron = document.getElementById('market-profile-chevron');
      if (panel) panel.classList.add('hidden');
      if (chevron) chevron.style.transform = 'rotate(0deg)';

      trackCardView(cardId);
      currentPresenceCardId = cardId;
      updatePresence(cardId);
      updateCardDetailStatsRow(cardId);

      document.getElementById('card-detail-modal').classList.remove('hidden');
    }

    function closeCardDetailModal() {
      document.getElementById('card-detail-modal').classList.add('hidden');
      activeDetailCardId = null;
      currentPresenceCardId = null;
      clearPresence();
    }

    // ===== CARD MARKET PROFILE & TRANSACTION HISTORY (item 1 & 9) =====
    function toggleCardMarketProfile() {
      const panel = document.getElementById('card-market-profile-panel');
      const chevron = document.getElementById('market-profile-chevron');
      if (!panel) return;

      marketProfilePanelOpen = !marketProfilePanelOpen;
      if (marketProfilePanelOpen) {
        renderCardMarketProfile(activeDetailCardId);
        panel.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
      } else {
        panel.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
      }
    }

    // Approved transactions that touched this specific card, oldest first
    function getCardTransactionHistory(cardId) {
      return transactionsList
        .filter(tx => tx.status === 'APPROVED' && Array.isArray(tx.items) && tx.items.some(i => i.id === cardId))
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    }

    // Deterministic, explainable rarity score out of 100. Not a stored field —
    // computed from tier (Premium vs Standard) and how low the serial number is,
    // since lower serials in a limited series are conventionally scarcer.
    function computeRarityIndex(card) {
      return getRarityBreakdown(card).score;
    }

    // Same scoring logic as computeRarityIndex, but also returns the human-readable
    // reasons behind the number so the UI can show a real checklist, not just a figure.
    function getRarityBreakdown(card) {
      const isPremium = card.type === 'PREMIUM';
      const serialNum = parseInt((card.sn || card.serial || '1').replace(/\D/g, ''), 10) || 1;
      const base = isPremium ? 92 : 68;
      const serialBonus = Math.max(0, 8 - Math.floor((serialNum - 1) / 3));
      const score = Math.min(100, base + serialBonus);

      const reasons = [];
      reasons.push(`Serial ${card.serial || ('*' + String(serialNum).padStart(2, '0'))}`);
      reasons.push(isPremium ? 'Premium Edition' : 'Standard Edition');
      reasons.push(`Only ${inventory.length || 50} copies in this series`);
      if (serialNum <= 5) reasons.push('Early release (first 5 minted)');
      else if (serialBonus > 0) reasons.push('Low serial number');
      if (card.owner) reasons.push('Actively held by a collector');

      return { score, reasons };
    }

    function timeAgoLabel(dateVal) {
      if (!dateVal) return '';
      const then = new Date(dateVal).getTime();
      if (isNaN(then)) return '';
      const diffMs = Date.now() - then;
      const days = Math.floor(diffMs / 86400000);
      if (days <= 0) return currentLanguage === 'ID' ? 'Hari ini' : 'Today';
      if (days === 1) return currentLanguage === 'ID' ? '1 hari lalu' : '1 day ago';
      if (days < 30) return currentLanguage === 'ID' ? `${days} hari lalu` : `${days} days ago`;
      const months = Math.floor(days / 30);
      if (months < 12) return currentLanguage === 'ID' ? `${months} bulan lalu` : `${months} month${months > 1 ? 's' : ''} ago`;
      const years = Math.floor(months / 12);
      return currentLanguage === 'ID' ? `${years} tahun lalu` : `${years} year${years > 1 ? 's' : ''} ago`;
    }

    function buildPriceHistorySparkline(card, history) {
      // Build a simple point series: original price -> each trade price -> current price.
      const points = [];
      const originalPrice = card.baseFloorPrice || card.price || 0;
      points.push(originalPrice);
      history.forEach(tx => {
        const item = tx.items.find(i => i.id === card.id) || {};
        if (item.price) points.push(item.price);
      });
      if (points[points.length - 1] !== card.price) points.push(card.price || 0);

      if (points.length < 2) return `<p class="text-[11px] text-slate-500 italic px-1">Not enough sales yet to chart a price trend.</p>`;

      const w = 280, h = 60, pad = 6;
      const min = Math.min(...points), max = Math.max(...points);
      const range = (max - min) || 1;
      const stepX = (w - pad * 2) / (points.length - 1);
      const coords = points.map((p, i) => {
        const x = pad + i * stepX;
        const y = h - pad - ((p - min) / range) * (h - pad * 2);
        return [x, y];
      });
      const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(' ');
      const areaD = `${pathD} L ${coords[coords.length - 1][0].toFixed(1)} ${h - pad} L ${coords[0][0].toFixed(1)} ${h - pad} Z`;
      const isUp = points[points.length - 1] >= points[0];
      const lineColor = isUp ? '#34d399' : '#fb7185';

      return `
        <svg viewBox="0 0 ${w} ${h}" class="w-full h-16">
          <path d="${areaD}" fill="${lineColor}" fill-opacity="0.12" stroke="none"></path>
          <path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          ${coords.map(c => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="2.5" fill="${lineColor}"></circle>`).join('')}
        </svg>
        <div class="flex justify-between text-[9px] text-slate-500 font-mono px-0.5 -mt-1">
          <span>${formatIDR(min)}</span>
          <span>${formatIDR(max)}</span>
        </div>
      `;
    }

    function renderCardMarketProfile(cardId) {
      const panel = document.getElementById('card-market-profile-panel');
      const card = inventory.find(c => c.id === cardId);
      if (!panel || !card) return;

      const dict = i18nDict[currentLanguage];
      const history = getCardTransactionHistory(cardId);

      const originalPrice = card.baseFloorPrice || card.price || 0;
      const currentValue = card.price || 0;
      const growthPct = originalPrice > 0 ? (((currentValue - originalPrice) / originalPrice) * 100) : 0;
      const growthSign = growthPct >= 0 ? '+' : '';
      const growthColor = growthPct > 0 ? 'text-emerald-400' : (growthPct < 0 ? 'text-rose-400' : 'text-slate-400');

      const uniqueOwners = new Set(history.map(tx => tx.user_name).filter(Boolean));
      if (card.owner) uniqueOwners.add(card.owner);

      const lastTx = history[history.length - 1];
      const lastSaleLine = lastTx
        ? `${formatIDR((lastTx.items.find(i => i.id === cardId) || {}).price || lastTx.total_amount || 0)} <span class="text-slate-500 font-normal">· ${timeAgoLabel(lastTx.created_at)}</span>`
        : `<span class="text-slate-500">${dict.mpNoSaleYet}</span>`;

      const rarity = getRarityBreakdown(card);

      // Ownership chain: House -> buyer 1 -> buyer 2 -> ... -> current owner
      const chain = ['House'];
      history.forEach(tx => { if (tx.user_name && chain[chain.length - 1] !== tx.user_name) chain.push(tx.user_name); });
      if (card.owner && chain[chain.length - 1] !== card.owner) chain.push(card.owner);

      const statsHtml = `
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="mp-stat"><span class="mp-label">${dict.mpCurrentValue}</span><strong class="mp-value text-emerald-400 text-sm">${formatIDR(currentValue)}</strong></div>
          <div class="mp-stat"><span class="mp-label">${dict.mpOriginalPrice}</span><strong class="mp-value text-white text-sm">${formatIDR(originalPrice)}</strong></div>
          <div class="mp-stat"><span class="mp-label">${dict.mpGrowth}</span><strong class="mp-value ${growthColor} text-sm">${growthSign}${growthPct.toFixed(1)}%</strong></div>
          <div class="mp-stat"><span class="mp-label">${dict.mpRarityIndex}</span><strong class="mp-value text-amber-400 text-sm">${rarity.score}/100</strong></div>
          <div class="mp-stat"><span class="mp-label">${dict.mpOwners}</span><strong class="mp-value text-white text-sm">${uniqueOwners.size} <span class="text-[9px] font-normal text-slate-500">${dict.mpCollectors}</span></strong></div>
          <div class="mp-stat"><span class="mp-label">${dict.mpTradeVolume}</span><strong class="mp-value text-white text-sm">${history.length} <span class="text-[9px] font-normal text-slate-500">${dict.mpTransactions}</span></strong></div>
          <div class="mp-stat col-span-2"><span class="mp-label">${dict.mpLastSale}</span><strong class="mp-value text-sm">${lastSaleLine}</strong></div>
        </div>
      `;

      const rarityHtml = `
        <div class="bg-slate-950 p-3 rounded-2xl border border-amber-500/20">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider">Rarity Score</h4>
            <span class="text-sm font-black font-mono text-amber-400">${rarity.score}<span class="text-[10px] text-slate-500">/100</span></span>
          </div>
          <ul class="space-y-1">
            ${rarity.reasons.map(r => `<li class="flex items-center gap-1.5 text-[11px] text-slate-300"><i class="fa-solid fa-check text-emerald-400 text-[9px]"></i> ${r}</li>`).join('')}
          </ul>
        </div>
      `;

      const priceChartHtml = `
        <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <h4 class="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider mb-2">Price History</h4>
          ${buildPriceHistorySparkline(card, history)}
        </div>
      `;

      let historyHtml = '';
      if (history.length === 0) {
        historyHtml = `<p class="text-[11px] text-slate-500 italic px-1">${dict.mpHistoryEmpty}</p>`;
      } else {
        historyHtml = history.map((tx, idx) => {
          const item = tx.items.find(i => i.id === cardId) || {};
          const label = idx === 0 ? dict.mpHistoryInitial : `${dict.mpHistoryTrade}${idx}`;
          return `
            <div class="flex items-center justify-between text-[11px] py-1.5 border-b border-slate-800/60 last:border-0">
              <div>
                <p class="font-bold text-white">${label}</p>
                <p class="text-slate-500 text-[10px]">${tx.user_name || 'Collector'} · ${timeAgoLabel(tx.created_at)}</p>
              </div>
              <strong class="font-mono text-emerald-400">${formatIDR(item.price || 0)}</strong>
            </div>
          `;
        }).join('') + `
          <div class="flex items-center justify-between text-[11px] pt-2 mt-1 border-t border-slate-700">
            <span class="font-bold text-amber-400">${dict.mpHistoryCurrentOwner}</span>
            <strong class="text-white">${card.owner || (currentLanguage === 'ID' ? 'Belum dimiliki' : 'Unowned')}</strong>
          </div>
        `;
      }

      const ownershipChainHtml = chain.length > 1 ? `
        <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <h4 class="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider mb-2">Ownership Chain</h4>
          <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
            ${chain.map((name, i) => `
              <span class="px-2 py-1 rounded-lg ${i === chain.length - 1 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold' : 'bg-slate-900 text-slate-300 border border-slate-800'}">${name}</span>
              ${i < chain.length - 1 ? '<i class="fa-solid fa-arrow-right text-slate-600 text-[9px]"></i>' : ''}
            `).join('')}
          </div>
        </div>
      ` : '';

      panel.innerHTML = `
        ${statsHtml}
        ${priceChartHtml}
        ${rarityHtml}
        <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <h4 class="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider mb-1.5">${dict.mpHistoryTitle}</h4>
          ${historyHtml}
        </div>
        ${ownershipChainHtml}
      `;
    }

    function sellBackToAdmin(cardId) {
      if (!currentUser) return showToast('Please log in.');
      const card = inventory.find(c => c.id === cardId);
      if (!card || (card.owner !== currentUser.name && card.owner !== currentUser.username)) return showToast('You do not own this card.');
      openSellbackQrisModal(cardId);
    }

    function openSellbackQrisModal(cardId) {
      const card = inventory.find(c => c.id === cardId);
      if (!card) return;

      document.getElementById('sellback-card-id-target').value = cardId;
      document.getElementById('sellback-modal-serial').innerText = `${card.serial} (${card.name})`;
      document.getElementById('sellback-modal-price').innerText = formatIDR(card.price);

      document.getElementById('sellback-qris-img-data').value = '';
      document.getElementById('sellback-qris-file-input').value = '';
      document.getElementById('sellback-qris-preview-container').classList.add('hidden');
      document.getElementById('sellback-qris-preview-img').src = '';

      document.getElementById('sellback-qris-modal').classList.remove('hidden');
    }

    function closeSellbackQrisModal() {
      document.getElementById('sellback-qris-modal').classList.add('hidden');
    }

    function handleSellbackQrisUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('sellback-qris-img-data').value = e.target.result;
        document.getElementById('sellback-qris-preview-img').src = e.target.result;
        document.getElementById('sellback-qris-preview-container').classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }

    async function submitSellBackRequest() {
      if (!currentUser) return showToast('Please log in.');

      const cardId = document.getElementById('sellback-card-id-target').value;
      const card = inventory.find(c => c.id === cardId);
      if (!card) return showToast('Card not found.');
      if (!card || (card.owner !== currentUser.name && card.owner !== currentUser.username)) return showToast('You do not own this card.');

      const payoutQrisData = document.getElementById('sellback-qris-img-data').value;
      if (!payoutQrisData) return showToast('Please upload your QRIS / PayPal payout code screenshot to receive payout.');

      const activeUserIdent = currentUser.username || currentUser.name;
      const orderRef = `SB-${Math.floor(1000 + Math.random() * 9000)}`;

      const sellbackOrder = {
        id: orderRef,
        type: 'SELLBACK',
        user_name: activeUserIdent,
        items: [{ id: card.id, serial: card.serial, name: card.name, price: card.price }],
        total_amount: card.price,
        payoutQrisUrl: payoutQrisData,
        status: 'PENDING',
        created_at: new Date().toISOString()
      };

      try {
        await db.collection("transactions").doc(orderRef).set(sellbackOrder);
        showToast(`Sell-back request ${orderRef} submitted! Waiting for Admin payout.`);
        addNotification('Sell-Back Requested', `Sell-back request ${orderRef} for ${card.serial} sent to Admin approval queue.`, 'fa-rotate-left text-amber-400');
        sendAdminApprovalEmail({
          order_id: orderRef,
          order_type: 'SELLBACK',
          user_name: activeUserIdent,
          amount: formatIDR(card.price),
          detail: `Sell-back request for ${card.serial} (${card.name})`
        });
        closeSellbackQrisModal();
      } catch (e) {
        showToast('Sell-back request error: ' + e.message);
      }
    }

    function openListCardForTradeModal() {
      if (!currentUser) return showToast('Please log in first.');
      const myIdent = currentUser.username || currentUser.name;
      const myCards = inventory.filter(c => c.owner === currentUser.name || c.owner === currentUser.username);
      if (myCards.length === 0) return showToast('You do not own any cards to list.');

      const selectEl = document.getElementById('list-card-select-input');
      if (selectEl) {
        selectEl.innerHTML = myCards.map(c => `<option value="${c.id}">${c.serial} - ${c.name}</option>`).join('');
        document.getElementById('list-card-id-target').value = myCards[0].id;
        document.getElementById('list-card-price-input').value = myCards[0].price;
      }

      document.getElementById('list-card-select-container')?.classList.remove('hidden');
      document.getElementById('list-modal-title').innerText = i18nDict[currentLanguage].listCardTradeTitle;
      document.getElementById('list-price-label').innerText = i18nDict[currentLanguage].askingPrice;
      document.getElementById('list-modal-mode').value = 'trade';
      document.getElementById('list-card-modal').classList.remove('hidden');
    }

    function openListCardModal(cardId, mode = 'trade') {
      if (!currentUser) return showToast('Please log in first.');
      const card = inventory.find(c => c.id === cardId);
      if (!card) return;

      document.getElementById('list-card-id-target').value = cardId;
      document.getElementById('list-modal-mode').value = mode;
      document.getElementById('list-card-price-input').value = card.price;

      document.getElementById('list-card-select-container')?.classList.add('hidden');

      if (mode === 'auction') {
        document.getElementById('list-modal-title').innerText = `${currentLanguage === 'ID' ? 'Daftarkan' : 'List'} ${card.serial} ${currentLanguage === 'ID' ? 'untuk Lelang' : 'for Auction'}`;
        document.getElementById('list-price-label').innerText = currentLanguage === 'ID' ? 'Jumlah Tawaran Awal (IDR)' : 'Starting Bid Amount (IDR)';
      } else {
        document.getElementById('list-modal-title').innerText = `${currentLanguage === 'ID' ? 'Daftarkan' : 'List'} ${card.serial} ${currentLanguage === 'ID' ? 'untuk Perdagangan' : 'for Trade'}`;
        document.getElementById('list-price-label').innerText = i18nDict[currentLanguage].askingPrice;
      }

      document.getElementById('list-card-modal').classList.remove('hidden');
    }

    function closeListCardModal() {
      document.getElementById('list-card-modal').classList.add('hidden');
    }

    async function submitCardListingModal() {
      const cardId = document.getElementById('list-card-id-target').value;
      const mode = document.getElementById('list-modal-mode').value;
      const price = parseFloat(document.getElementById('list-card-price-input').value);
      const card = inventory.find(c => c.id === cardId);
      if (!card || !price) return showToast('Please select a valid card and enter a price.');

      const activeUserIdent = currentUser.username || currentUser.name;

      if (mode === 'auction') {
        const auctionData = {
          cardId: cardId,
          serial: card.serial,
          name: card.name,
          imgUrl: card.imgUrl,
          owner: activeUserIdent,
          startingPrice: price,
          currentBid: price,
          highBidder: 'None',
          created_at: new Date().toISOString()
        };

        try {
          await db.collection("system").doc("activeAuction").set(auctionData);
          closeListCardModal();
          showToast(`Successfully set ${card.serial} as active auction!`);
          addNotification('Auction Started', `Card ${card.serial} is now live in the Auction Room.`, 'fa-gavel text-emerald-400');
          await fetchActiveAuction();
          switchTab('auction');
        } catch (e) {
          showToast('Auction error: ' + e.message);
        }
      } else {
        const listingId = 'list-' + cardId;
        const listingData = {
          cardId: cardId,
          serial: card.serial,
          name: card.name,
          type: card.type,
          imgUrl: card.imgUrl,
          price: price,
          seller: activeUserIdent,
          created_at: new Date().toISOString()
        };

        try {
          await db.collection("listings").doc(listingId).set(listingData);
          closeListCardModal();
          showToast(`Listed ${card.serial} in the Trading Room!`);
          addNotification('Card Listed', `Published ${card.serial} for trade/sale.`, 'fa-tag text-amber-400');
          await fetchListings();
          switchTab('trade');
        } catch (e) {
          showToast('Listing error: ' + e.message);
        }
      }
    }

    function toggleTradeOfferTypeFields() {
      const typeSelect = document.getElementById('trade-req-type-select');
      const myCardContainer = document.getElementById('trade-my-card-container');
      const plusAmountContainer = document.getElementById('trade-plus-amount-container');

      if (!typeSelect || !myCardContainer || !plusAmountContainer) return;

      if (typeSelect.value === 'TRADE') {
        myCardContainer.classList.remove('hidden');
        plusAmountContainer.classList.remove('hidden');

        // Populate dropdown with user's owned cards from Vault
        const myCardSelect = document.getElementById('trade-my-card-select');
        if (myCardSelect && currentUser) {
          const myCards = inventory.filter(c => c.owner === currentUser.name || c.owner === currentUser.username);
          if (myCards.length > 0) {
            myCardSelect.innerHTML = myCards.map(c => `<option value="${c.id}">${c.serial} - ${c.name} (${formatIDR(c.price)})</option>`).join('');
          } else {
            myCardSelect.innerHTML = `<option value="">-- No Cards in Your Vault --</option>`;
          }
        }
      } else {
        myCardContainer.classList.add('hidden');
        plusAmountContainer.classList.add('hidden');
      }
    }

    function openProposeTradeModal() {
      if (!currentUser) return showToast('Please log in first.');
      const myIdent = currentUser.username || currentUser.name;
      
      const ownedByOthers = inventory.filter(c => c.owner && c.owner !== currentUser.name && c.owner !== currentUser.username);
      if (ownedByOthers.length === 0) {
        return showToast('No cards owned by other collectors available to request right now.');
      }

      tradeCardOptionsList = ownedByOthers.map(c => ({
        value: c.id,
        label: `${c.serial} - ${c.name} (${c.owner})`,
        searchText: `${c.serial} ${c.name} ${c.owner}`.toLowerCase()
      }));

      selectTradeCardOption('', i18nDict[currentLanguage].selectCardPlaceholder);
      toggleTradeOfferTypeFields();
      document.getElementById('propose-trade-modal').classList.remove('hidden');
    }

    function closeProposeTradeModal() {
      document.getElementById('propose-trade-modal').classList.add('hidden');
      document.getElementById('trade-dropdown-menu')?.classList.add('hidden');
    }

    async function submitTradeRequest() {
      if (!currentUser) return showToast('Please log in.');
      const cardId = document.getElementById('trade-req-card-id').value;
      const type = document.getElementById('trade-req-type-select').value;
      let notes = document.getElementById('trade-req-notes-input').value.trim();

      if (!cardId) return showToast('Please select a target card from the dropdown.');

      const card = inventory.find(c => c.id === cardId);
      if (!card || !card.owner) return showToast('Invalid card target.');

      let offeredCardId = null;
      let offeredCardSerial = null;
      let offeredCardName = null;
      let plusAmount = 0;

      if (type === 'TRADE') {
        const myCardSelect = document.getElementById('trade-my-card-select');
        offeredCardId = myCardSelect ? myCardSelect.value : null;

        if (!offeredCardId) {
          return showToast('Please select a card from your Vault to offer in trade.');
        }

        const offeredCardObj = inventory.find(c => c.id === offeredCardId);
        if (offeredCardObj) {
          offeredCardSerial = offeredCardObj.serial;
          offeredCardName = offeredCardObj.name;
        }

        const rawPlus = parseFloat(document.getElementById('trade-plus-amount-input')?.value || 0);
        plusAmount = isNaN(rawPlus) ? 0 : rawPlus;

        const tradeSummaryStr = `Trade Card: ${offeredCardSerial || 'Card'} ${plusAmount > 0 ? '+ ' + formatIDR(plusAmount) : ''}`;
        notes = notes ? `${tradeSummaryStr} | ${notes}` : tradeSummaryStr;
      } else {
        if (!notes) notes = 'Direct buy offer';
      }

      const activeUserIdent = currentUser.username || currentUser.name;
      const reqId = 'treq-' + Date.now();
      const requestData = {
        id: reqId,
        cardId: cardId,
        serial: card.serial,
        cardName: card.name,
        cardImg: card.imgUrl,
        targetOwner: card.owner,
        proposer: activeUserIdent,
        offerType: type,
        notes: notes,
        status: 'PENDING',
        created_at: new Date().toISOString()
      };

      if (type === 'TRADE') {
        requestData.offeredCardId = offeredCardId;
        requestData.offeredCardSerial = offeredCardSerial;
        requestData.offeredCardName = offeredCardName;
        requestData.plusAmount = plusAmount;
      }

      try {
        await db.collection("tradeRequests").doc(reqId).set(requestData);
        closeProposeTradeModal();
        showToast('Trade/Buy proposal submitted successfully!');
        addNotification('Trade Proposal Sent', `Proposed ${type} offer to ${card.owner} for ${card.serial}.`, 'fa-handshake text-purple-400');
        await fetchTradeRequests();
        switchTab('trade-req');
      } catch (e) {
        showToast('Error submitting trade proposal: ' + e.message);
      }
    }

    async function withdrawTradeRequest(reqId) {
      if (!currentUser) return showToast('Please log in.');
      const req = tradeRequestsList.find(r => r.id === reqId);
      if (!req) return;

      const myIdent = currentUser.username || currentUser.name;
      if (req.proposer !== currentUser.name && req.proposer !== currentUser.username && !currentUser.isAdmin) {
        return showToast('You can only cancel/withdraw your own proposed trade requests.');
      }

      if (!confirm('Are you sure you want to cancel/withdraw this trade offer?')) return;

      try {
        await db.collection("tradeRequests").doc(reqId).delete();
        showToast('Trade request canceled/withdrawn.');
        addNotification('Trade Withdrawn', `Canceled trade offer for ${req.serial}.`, 'fa-rotate-left text-amber-400');
        await fetchTradeRequests();
      } catch (e) {
        showToast('Error withdrawing trade: ' + e.message);
      }
    }

    async function acceptTradeRequest(reqId) {
      if (!currentUser) return showToast('Please log in.');
      const req = tradeRequestsList.find(r => r.id === reqId);
      if (!req) return showToast('Proposal not found.');

      const myIdent = currentUser.username || currentUser.name;
      const canAccept = (req.targetOwner === currentUser.name || req.targetOwner === currentUser.username) || currentUser.isAdmin;
      if (!canAccept) {
        return showToast('Only the target card owner or Admin can accept this proposal.');
      }

      if (!confirm(`Accept offer from ${req.proposer} for ${req.serial}? Ownership will transfer to ${req.proposer}.`)) return;

      try {
        const batch = db.batch();
        const cardRef = db.collection("cards").doc(req.cardId);
        batch.update(cardRef, { owner: req.proposer, status: 'SOLD' });

        if (req.offerType === 'TRADE' && req.offeredCardId) {
          const offeredCardRef = db.collection("cards").doc(req.offeredCardId);
          batch.update(offeredCardRef, { owner: req.targetOwner, status: 'SOLD' });
        }

        const reqRef = db.collection("tradeRequests").doc(reqId);
        batch.update(reqRef, { status: 'ACCEPTED' });

        await batch.commit();

        showToast(`Trade accepted! Card ${req.serial} transferred to ${req.proposer}.`);
        addNotification('Trade Accepted', `Card ${req.serial} transferred to ${req.proposer}.`, 'fa-check text-emerald-400');

        await loadAppState();
      } catch (e) {
        showToast('Error accepting trade: ' + e.message);
      }
    }

    async function acceptCounterOffer(reqId) {
      if (!currentUser) return showToast('Please log in.');
      const req = tradeRequestsList.find(r => r.id === reqId);
      if (!req) return showToast('Proposal not found.');

      const myIdent = currentUser.username || currentUser.name;
      if (req.proposer !== currentUser.name && req.proposer !== currentUser.username && !currentUser.isAdmin) {
        return showToast('Only the original offer proposer or Admin can accept this counter offer.');
      }

      if (!confirm(`Accept counter-offer for ${req.serial}? Ownership will be updated to ${req.proposer}.`)) return;

      try {
        const batch = db.batch();
        const cardRef = db.collection("cards").doc(req.cardId);
        batch.update(cardRef, { owner: req.proposer, status: 'SOLD' });

        if (req.offerType === 'TRADE' && req.offeredCardId) {
          const offeredCardRef = db.collection("cards").doc(req.offeredCardId);
          batch.update(offeredCardRef, { owner: req.targetOwner, status: 'SOLD' });
        }

        const reqRef = db.collection("tradeRequests").doc(reqId);
        batch.update(reqRef, { status: 'ACCEPTED' });

        await batch.commit();

        showToast(`Counter offer accepted! Card ${req.serial} transferred to ${req.proposer}.`);
        addNotification('Counter Offer Accepted', `Card ${req.serial} transferred to ${req.proposer}.`, 'fa-circle-check text-emerald-400');

        await loadAppState();
      } catch (e) {
        showToast('Error accepting counter offer: ' + e.message);
      }
    }

    async function rejectCounterOffer(reqId) {
      if (!currentUser) return showToast('Please log in.');
      const req = tradeRequestsList.find(r => r.id === reqId);
      if (!req) return;

      const myIdent = currentUser.username || currentUser.name;
      if (req.proposer !== currentUser.name && req.proposer !== currentUser.username && !currentUser.isAdmin) {
        return showToast('Only the proposer can reject this counter offer.');
      }

      if (!confirm('Reject this counter offer?')) return;

      try {
        await db.collection("tradeRequests").doc(reqId).update({ status: 'REJECTED' });
        showToast('Counter offer rejected.');
        addNotification('Counter Offer Rejected', `Rejected counter offer for ${req.serial}.`, 'fa-xmark text-rose-400');
        await fetchTradeRequests();
      } catch (e) {
        showToast('Error rejecting counter offer: ' + e.message);
      }
    }

    async function rejectTradeRequest(reqId) {
      if (!currentUser) return showToast('Please log in.');
      const req = tradeRequestsList.find(r => r.id === reqId);
      if (!req) return;

      const myIdent = currentUser.username || currentUser.name;
      if (req.targetOwner !== currentUser.name && req.targetOwner !== currentUser.username && !currentUser.isAdmin) {
        return showToast('Only the card owner can reject this proposal.');
      }

      if (!confirm('Reject this trade request?')) return;

      try {
        await db.collection("tradeRequests").doc(reqId).update({ status: 'REJECTED' });
        showToast('Trade offer rejected.');
        addNotification('Trade Offer Rejected', `Rejected offer from ${req.proposer} for ${req.serial}.`, 'fa-xmark text-rose-400');
        await fetchTradeRequests();
      } catch (e) {
        showToast('Error rejecting trade: ' + e.message);
      }
    }

    function openCounterOfferModal(reqId) {
      const req = tradeRequestsList.find(r => r.id === reqId);
      if (!req) return;

      document.getElementById('counter-req-id-target').value = reqId;
      document.getElementById('counter-notes-input').value = `Counter offer to ${req.proposer}: `;
      document.getElementById('counter-offer-modal').classList.remove('hidden');
    }

    function closeCounterOfferModal() {
      document.getElementById('counter-offer-modal').classList.add('hidden');
    }

    function showConfirmModal({ title, message, confirmText, confirmClass, icon, onConfirm }) {
      document.getElementById('generic-confirm-title').innerText = title || 'Are you sure?';
      document.getElementById('generic-confirm-message').innerText = message || '';

      const iconEl = document.getElementById('generic-confirm-icon');
      iconEl.className = `fa-solid ${icon || 'fa-triangle-exclamation text-amber-400'} text-xl`;

      const btn = document.getElementById('generic-confirm-btn');
      btn.innerText = confirmText || 'Confirm';
      btn.className = `flex-1 py-2.5 font-extrabold text-xs rounded-xl transition-all ${confirmClass || 'bg-amber-500 hover:bg-amber-400 text-slate-950'}`;

      pendingConfirmAction = typeof onConfirm === 'function' ? onConfirm : null;
      document.getElementById('generic-confirm-modal').classList.remove('hidden');
    }

    function closeConfirmModal() {
      document.getElementById('generic-confirm-modal').classList.add('hidden');
      pendingConfirmAction = null;
    }

    function handleConfirmModalAccept() {
      const action = pendingConfirmAction;
      closeConfirmModal();
      if (action) action();
    }

    async function submitCounterOffer() {
      const reqId = document.getElementById('counter-req-id-target').value;
      const counterNotes = document.getElementById('counter-notes-input').value.trim();
      const req = tradeRequestsList.find(r => r.id === reqId);

      if (!req || !counterNotes) return showToast('Invalid details.');

      try {
        await db.collection("tradeRequests").doc(reqId).update({
          notes: counterNotes,
          status: 'COUNTERED'
        });

        closeCounterOfferModal();
        showToast('Counter offer sent!');
        addNotification('Counter Offer Sent', `Submitted counter offer for ${req.serial}.`, 'fa-pen-to-square text-amber-400');
        await fetchTradeRequests();
      } catch (e) {
        showToast('Error submitting counter offer: ' + e.message);
      }
    }

    function renderTradeRequests() {
      const grid = document.getElementById('trade-requests-grid');
      if (!grid) return;

      if (tradeRequestsList.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500 text-xs">No active trade requests or offers currently pending.</div>`;
        return;
      }

      grid.innerHTML = tradeRequestsList.map(req => {
        const myIdent = currentUser ? (currentUser.username || currentUser.name) : '';
        const isProposer = currentUser && (req.proposer === currentUser.name || req.proposer ===currentUser.username);
        const isTarget = currentUser && (req.targetOwner === currentUser.name || req.targetOwner === currentUser.username);
        const isAdmin = currentUser && currentUser.isAdmin;

        let statusBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        if (req.status === 'ACCEPTED') statusBadge = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
        if (req.status === 'REJECTED') statusBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
        if (req.status === 'COUNTERED') statusBadge = 'bg-purple-500/20 text-purple-400 border-purple-500/30';

        let actionButtons = '';
        if (req.status === 'PENDING') {
          if (isTarget || isAdmin) {
            actionButtons = `
              <div class="flex gap-2 pt-2">
                <button onclick="acceptTradeRequest('${req.id}')" class="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition-all"><i class="fa-solid fa-check mr-1"></i> Accept</button>
                <button onclick="openCounterOfferModal('${req.id}')" class="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all"><i class="fa-solid fa-pen-to-square mr-1"></i> Counter</button>
                <button onclick="rejectTradeRequest('${req.id}')" class="py-2 px-3 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 font-bold text-xs rounded-xl transition-all"><i class="fa-solid fa-xmark"></i></button>
              </div>
            `;
          } else if (isProposer) {
            actionButtons = `
              <button onclick="withdrawTradeRequest('${req.id}')" class="w-full py-2 bg-slate-800 hover:bg-rose-950/50 text-rose-400 font-bold text-xs rounded-xl border border-slate-700 transition-all mt-2"><i class="fa-solid fa-ban mr-1"></i> Withdraw Request</button>
            `;
          }
        } else if (req.status === 'COUNTERED') {
          if (isProposer || isAdmin) {
            actionButtons = `
              <div class="flex gap-2 pt-2">
                <button onclick="acceptCounterOffer('${req.id}')" class="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition-all"><i class="fa-solid fa-check mr-1"></i> Accept Counter</button>
                <button onclick="rejectCounterOffer('${req.id}')" class="flex-1 py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 font-bold text-xs rounded-xl transition-all"><i class="fa-solid fa-xmark mr-1"></i> Decline</button>
              </div>
            `;
          }
        }

        return `
          <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 relative shadow-xl">
            <div class="flex justify-between items-start">
              <div class="flex items-center gap-3">
                <img src="${req.cardImg}" class="w-12 h-12 rounded-xl object-contain bg-slate-950 border border-slate-800 p-1">
                <div>
                  <h4 class="font-extrabold text-white text-sm">${req.cardName} (${req.serial})</h4>
                  <p class="text-[11px] text-slate-400">Target Owner: <strong class="text-amber-400">${req.targetOwner}</strong></p>
                </div>
              </div>
              <span class="text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border ${statusBadge}">${req.status}</span>
            </div>

            <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-1.5 text-xs">
              <div class="flex justify-between text-slate-400">
                <span>Proposed By:</span>
                <strong class="text-white">${req.proposer}</strong>
              </div>
              <div class="flex justify-between text-slate-400">
                <span>Offer Type:</span>
                <strong class="text-indigo-400 font-mono">${req.offerType}</strong>
              </div>
              ${req.offeredCardSerial ? `
                <div class="flex justify-between text-slate-400">
                  <span>Offered Card:</span>
                  <strong class="text-purple-400 font-mono">${req.offeredCardSerial} - ${req.offeredCardName}</strong>
                </div>
              ` : ''}
              ${req.plusAmount ? `
                <div class="flex justify-between text-slate-400">
                  <span>Plus Cash Top-up:</span>
                  <strong class="text-emerald-400 font-mono">${formatIDR(req.plusAmount)}</strong>
                </div>
              ` : ''}
              <div class="pt-1.5 border-t border-slate-800/60 text-slate-300 italic text-[11px]">
                "${req.notes || 'No custom terms provided.'}"
              </div>
            </div>

            <div class="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>Submitted: ${new Date(req.created_at).toLocaleDateString()}</span>
              <button onclick="openDirectChat('${isProposer ? req.targetOwner : req.proposer}', 'Trade Offer Negotiations')" class="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1">
                <i class="fa-solid fa-comments"></i> Chat Dealer
              </button>
            </div>

            ${actionButtons}
          </div>
        `;
      }).join('');
    }

    function renderP2PListings() {
      const grid = document.getElementById('p2p-listings-grid');
      if (!grid) return;

      if (activeListings.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-slate-500 text-xs">No active card listings available in the Trading Room right now.</div>`;
        return;
      }

      grid.innerHTML = activeListings.map(item => {
        const isMine = currentUser && (item.seller === currentUser.name || item.seller === currentUser.username);

        return `
          <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between relative shadow-xl hover:border-amber-500/40 transition-all">
            <div>
              <div class="flex justify-between items-center mb-2">
                <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${item.type === 'PREMIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}">${item.type || 'TRADE'}</span>
                <span class="text-[10px] text-slate-400 font-mono">Seller: <strong class="text-white">${item.seller}</strong></span>
              </div>

              <div class="w-full aspect-[4/5] bg-slate-950 rounded-2xl border border-slate-800 p-2 flex flex-col justify-between mb-3 text-center overflow-hidden">
                <div class="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden">
                  <img src="${item.imgUrl}" loading="lazy" class="w-full h-full object-contain">
                </div>
              </div>

              <p class="text-center font-black text-amber-400 font-mono text-base">${item.serial}</p>
              <p class="text-xs font-extrabold text-white text-center truncate mb-2">${item.name}</p>
            </div>

            <div class="space-y-2 pt-2 border-t border-slate-800">
              <div class="flex justify-between items-center">
                <span class="text-[10px] text-slate-400 font-bold uppercase">Listing Price</span>
                <span class="text-sm font-black text-emerald-400 font-mono">${formatIDR(item.price)}</span>
              </div>

              ${isMine ? `
                <button onclick="cancelTradeListing('${item.id}')" class="w-full py-2 bg-slate-800 hover:bg-rose-950/60 text-rose-400 font-bold text-xs rounded-xl border border-slate-700 transition-all">Cancel Listing</button>
              ` : `
                <div class="grid grid-cols-2 gap-2">
                  <button onclick="addToCart('${item.cardId}')" class="py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all">Buy Now</button>
                  <button onclick="openDirectChat('${item.seller}', 'Trade Negotiation: ${item.serial}')" class="py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-xl transition-all"><i class="fa-solid fa-comments mr-1"></i> Chat</button>
                </div>
              `}
            </div>
          </div>
        `;
      }).join('');
    }

    async function cancelTradeListing(listingId) {
      if (!currentUser) return showToast('Please log in.');

      try {
        await db.collection("listings").doc(listingId).delete();
        showToast('Listing canceled successfully.');
        addNotification('Listing Canceled', 'Removed card from Trading Room.', 'fa-xmark text-rose-400');
        await fetchListings();
      } catch (e) {
        showToast('Error canceling listing: ' + e.message);
      }
    }

    async function placeAuctionBid() {
      if (!currentUser) return showToast('Please log in to place an auction bid.');
      if (!activeAuction) return showToast('No active auction running.');

      const isOwnAuction = currentUser.name === activeAuction.owner || currentUser.username === activeAuction.owner;
      if (isOwnAuction) return showToast('You cannot bid on your own card auction.');

      const bidInput = document.getElementById('bid-input-amount');
      const bidVal = parseFloat(bidInput.value);
      const currentHighest = Number(activeAuction.currentBid || activeAuction.startingPrice || 0);

      if (!bidVal || isNaN(bidVal)) return showToast('Please enter a valid numeric bid amount.');
      if (bidVal <= currentHighest) return showToast(`Bid must be higher than current price of ${formatIDR(currentHighest)}.`);

      const activeUserIdent = currentUser.username ? `@${currentUser.username}` : currentUser.name;
      const history = Array.isArray(activeAuction.bidHistory) ? activeAuction.bidHistory : [];
      history.push({
        bidder: activeUserIdent,
        amount: bidVal,
        timestamp: new Date().toISOString()
      });

      try {
        await db.collection("system").doc("activeAuction").update({
          currentBid: bidVal,
          highBidder: activeUserIdent,
          bidHistory: history
        });

        bidInput.value = '';
        showToast(`Bid of ${formatIDR(bidVal)} submitted!`);
        addNotification('Auction Bid Placed', `Placed highest bid of ${formatIDR(bidVal)} on ${activeAuction.serial}.`, 'fa-gavel text-amber-400');
        await fetchActiveAuction();
      } catch (e) {
        showToast('Bid error: ' + e.message);
      }
    }

    async function cancelActiveAuction() {
      if (!currentUser) return showToast('Please log in.');
      if (!activeAuction) return;

      const canCancel = currentUser.isAdmin || currentUser.name === activeAuction.owner || currentUser.username === activeAuction.owner;
      if (!canCancel) return showToast('Only the card owner or Admin can cancel the auction.');

      if (!confirm(`Are you sure you want to cancel the auction for ${activeAuction.serial}?`)) return;

      try {
        await db.collection("system").doc("activeAuction").delete();
        showToast('Auction canceled.');
        addNotification('Auction Canceled', `Canceled live auction for ${activeAuction.serial}.`, 'fa-ban text-rose-400');
        await fetchActiveAuction();
      } catch (e) {
        showToast('Error canceling auction: ' + e.message);
      }
    }

    // ===== COLLECTOR LEVEL SYSTEM (item 3) =====
    function getCollectorTradesCompleted(user) {
      if (!user) return 0;
      return tradeRequestsList.filter(r =>
        r.status === 'ACCEPTED' &&
        (r.proposer === user.name || r.proposer === user.username || r.targetOwner === user.name || r.targetOwner === user.username)
      ).length;
    }

    function computeCollectorLevel(cardsOwned, tradesCompleted) {
      const xp = (cardsOwned * 10) + (tradesCompleted * 15);
      const level = Math.floor(xp / 50) + 1;
      const xpIntoLevel = xp % 50;
      const pct = Math.round((xpIntoLevel / 50) * 100);

      let title;
      if (level >= 15) title = currentLanguage === 'ID' ? 'Kolektor Legendaris' : 'Legendary Collector';
      else if (level >= 10) title = currentLanguage === 'ID' ? 'Kolektor Elite' : 'Elite Collector';
      else if (level >= 6) title = currentLanguage === 'ID' ? 'Kolektor Veteran' : 'Veteran Collector';
      else if (level >= 3) title = currentLanguage === 'ID' ? 'Kolektor' : 'Collector';
      else title = currentLanguage === 'ID' ? 'Kolektor Pemula' : 'Novice Collector';

      return { level, pct, title };
    }

    function renderCollectorLevel(owned) {
      const panel = document.getElementById('collector-level-panel');
      if (!panel || !currentUser) return;
      panel.classList.remove('hidden');

      const dict = i18nDict[currentLanguage];
      const tradesCompleted = getCollectorTradesCompleted(currentUser);
      const collectionValue = owned.reduce((sum, c) => sum + (c.price || 0), 0);
      const { level, pct, title } = computeCollectorLevel(owned.length, tradesCompleted);

      document.getElementById('collector-level-ring').style.setProperty('--pct', pct);
      document.getElementById('collector-level-number').innerText = level;
      document.getElementById('collector-level-title').innerText = title;
      document.getElementById('collector-level-progress-fill').style.width = `${pct}%`;
      document.getElementById('collector-stat-cards-owned').innerText = owned.length;
      document.getElementById('collector-stat-trades').innerText = tradesCompleted;
      document.getElementById('collector-stat-value').innerText = formatIDR(collectionValue);

      const hasLowSerial = owned.some(c => (parseInt((c.sn || '999').replace(/\D/g, ''), 10) || 999) <= 5);
      const hasPremium = owned.some(c => c.type === 'PREMIUM');

      const badges = [
        { earned: owned.length >= 1, label: dict.badgeCollector, icon: 'fa-star', cls: 'badge-cyan' },
        { earned: hasLowSerial, label: dict.badgeGenesis, icon: 'fa-trophy', cls: 'badge-gold' },
        { earned: tradesCompleted >= 5, label: dict.badgeActiveTrader, icon: 'fa-fire', cls: 'badge-rose' },
        { earned: hasPremium, label: dict.badgePremiumHolder, icon: 'fa-gem', cls: 'badge-gold' },
      ];

      document.getElementById('collector-badges-row').innerHTML = badges.map(b => `
        <span class="badge-chip ${b.earned ? b.cls : 'badge-locked'}">
          <i class="fa-solid ${b.earned ? b.icon : 'fa-lock'}"></i> ${b.label}
        </span>
      `).join('');
    }

    // ===== COLLECTION COMPLETION SYSTEM (item 7) =====
    function renderCollectionCompletionPanel(owned) {
      const panel = document.getElementById('collection-completion-panel');
      if (!panel || !currentUser) return;
      panel.classList.remove('hidden');

      const dict = i18nDict[currentLanguage];
      const totalCards = inventory.length || 50;
      const ownedIds = new Set(owned.map(c => c.id));
      const missing = inventory.filter(c => !ownedIds.has(c.id));
      const pct = totalCards > 0 ? Math.round((owned.length / totalCards) * 100) : 0;

      document.getElementById('collection-completion-pct').innerText = `${pct}%`;
      document.getElementById('collection-completion-fill').style.width = `${pct}%`;
      document.getElementById('collection-completion-count').innerHTML = `<span>${dict.collectionCompletionCollected}</span>: ${owned.length} / ${totalCards}`;

      const missingEl = document.getElementById('collection-completion-missing');
      if (missing.length === 0) {
        missingEl.innerHTML = '';
      } else {
        const shown = missing.slice(0, 8).map(c => `<span class="inline-block bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[10px] text-amber-400 mr-1 mb-1">${c.serial}</span>`).join('');
        const extra = missing.length > 8 ? `<span class="text-slate-500">+${missing.length - 8} ${dict.collectionCompletionMissingMore}</span>` : '';
        missingEl.innerHTML = `<span class="text-slate-500 font-bold uppercase text-[9px] tracking-wider block mb-1">${dict.collectionCompletionMissing}</span>${shown}${extra}`;
      }

      const rewardEl = document.getElementById('collection-completion-reward');
      if (pct >= 100) {
        rewardEl.innerHTML = `<i class="fa-solid fa-medal mr-1.5"></i>${dict.collectionCompletionRewardUnlocked}`;
      } else {
        rewardEl.innerHTML = `<i class="fa-solid fa-lock mr-1.5 text-slate-500"></i><span class="text-slate-400 font-normal">${dict.collectionCompletionRewardLocked}</span>`;
      }
    }

    function renderOwnedCards() {
      const grid = document.getElementById('owned-cards-grid');
      const banner = document.getElementById('collector-social-banner');
      if (!grid) return;

      if (!currentUser) {
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-slate-500 text-xs">Please log in to view your Vault binder.</div>`;
        if (banner) banner.classList.add('hidden');
        const levelPanel = document.getElementById('collector-level-panel');
        const completionPanel = document.getElementById('collection-completion-panel');
        if (levelPanel) levelPanel.classList.add('hidden');
        if (completionPanel) completionPanel.classList.add('hidden');
        return;
      }

      if (banner) {
        banner.classList.remove('hidden');
        document.getElementById('dashboard-banner-avatar').src = currentUser.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${currentUser.email}`;
        document.getElementById('dashboard-banner-name').innerText = currentUser.name;
        document.getElementById('dashboard-banner-username').innerText = currentUser.username ? `@${currentUser.username}` : '';
        document.getElementById('dashboard-banner-bio').innerText = currentUser.bio || 'Collector Vault';

        const linksContainer = document.getElementById('dashboard-banner-links');
        let linksHtml = '';
        if (currentUser.socialIg) {
          const href = currentUser.socialIg.startsWith('http') ? currentUser.socialIg : `https://instagram.com/${currentUser.socialIg.replace('@','')}`;
          linksHtml += `<a href="${href}" target="_blank" class="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-rose-400 text-xs rounded-xl transition-all" title="Instagram"><i class="fa-brands fa-instagram"></i></a>`;
        }
        if (currentUser.socialTwitter) {
          const href = currentUser.socialTwitter.startsWith('http') ? currentUser.socialTwitter : `https://x.com/${currentUser.socialTwitter.replace('@','')}`;
          linksHtml += `<a href="${href}" target="_blank" class="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs rounded-xl transition-all" title="X / Twitter"><i class="fa-brands fa-x-twitter"></i></a>`;
        }
        if (currentUser.socialTiktok) {
          const href = currentUser.socialTiktok.startsWith('http') ? currentUser.socialTiktok : `https://tiktok.com/@${currentUser.socialTiktok.replace('@','')}`;
          linksHtml += `<a href="${href}" target="_blank" class="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-cyan-400 text-xs rounded-xl transition-all" title="TikTok"><i class="fa-brands fa-tiktok"></i></a>`;
        }
        if (currentUser.socialWeb) {
          const href = currentUser.socialWeb.startsWith('http') ? currentUser.socialWeb : `https://${currentUser.socialWeb}`;
          linksHtml += `<a href="${href}" target="_blank" class="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-indigo-400 text-xs rounded-xl transition-all" title="Website"><i class="fa-solid fa-globe"></i></a>`;
        }
        linksContainer.innerHTML = linksHtml || `<span class="text-[10px] text-slate-600 italic">No social links added</span>`;
      }

      const owned = inventory.filter(c => c.owner === currentUser.name || c.owner === currentUser.username);

      renderCollectorLevel(owned);
      renderCollectionCompletionPanel(owned);

      if (owned.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-slate-500 text-xs">Your Vault binder is empty. Buy cards from the collection catalog or trade room!</div>`;
        return;
      }

      grid.innerHTML = owned.map(card => `
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between relative shadow-xl hover:border-amber-500/40 transition-all">
          <div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${card.type === 'PREMIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}">${card.type}</span>
              <span class="text-[10px] font-mono text-emerald-400 font-extrabold">${formatIDR(card.price)}</span>
            </div>

            <div class="w-full aspect-[4/5] bg-slate-950 rounded-2xl border border-slate-800 p-2 flex flex-col justify-between mb-3 text-center overflow-hidden">
              <div class="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden">
                <img src="${card.imgUrl}" loading="lazy" class="w-full h-full object-contain">
              </div>
            </div>

            <p class="text-center font-black text-amber-400 font-mono serial-engraved text-base">${card.serial}</p>
            <p class="text-xs font-extrabold text-white text-center truncate mb-3">${card.name}</p>
          </div>

          <div class="space-y-2">
            <button onclick="openListCardModal('${card.id}', 'trade')" class="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5">
              <i class="fa-solid fa-right-left"></i> List in Trade Room
            </button>
            <div class="grid grid-cols-2 gap-2">
              <button onclick="openListCardModal('${card.id}', 'auction')" class="py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1">
                <i class="fa-solid fa-gavel"></i> Auction
              </button>
              <button onclick="sellBackToAdmin('${card.id}')" class="py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 font-bold text-xs rounded-xl border border-rose-500/30 transition-all flex items-center justify-center gap-1">
                <i class="fa-solid fa-rotate-left"></i> Sell Back
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }

    function renderWishlistPage() {
      const grid = document.getElementById('wishlist-page-grid');
      if (!grid) return;

      const wishlistItems = inventory.filter(c => wishlist.has(c.id));

      if (wishlistItems.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-slate-500 text-xs">Your wishlist is empty. Click the heart icon on any card catalog item to save it!</div>`;
        return;
      }

      grid.innerHTML = wishlistItems.map(card => `
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-3 flex flex-col justify-between relative shadow-xl">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${card.type === 'PREMIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}">${card.type}</span>
            <button onclick="toggleWishlist('${card.id}')" class="text-rose-500 hover:text-rose-400 text-xs transition-colors"><i class="fa-solid fa-heart"></i></button>
          </div>

          <div class="w-full aspect-[4/5] bg-slate-950 rounded-2xl border border-slate-800 p-2 text-center flex flex-col justify-between mb-2 overflow-hidden">
            <div class="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden">
              <img src="${card.imgUrl}" loading="lazy" class="w-full h-full object-contain">
            </div>
          </div>

          <p class="text-center font-black text-amber-400 font-mono mb-1">${card.serial}</p>
          <p class="text-xs font-extrabold text-white truncate mb-2 text-center">${card.name}</p>

          <button onclick="openProposeTradeModal()" class="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1">
            <i class="fa-solid fa-handshake"></i> Propose Trade
          </button>
        </div>
      `).join('');
    }

    function toggleWishlist(cardId) {
      if (wishlist.has(cardId)) {
        wishlist.delete(cardId);
        showToast('Removed card from wishlist.');
      } else {
        wishlist.add(cardId);
        showToast('Saved card to wishlist!');
      }
      saveWishlistToStorage();
      renderCardGrid();
      if (!document.getElementById('view-wishlist').classList.contains('hidden')) renderWishlistPage();
    }

    function clearWishlist() {
      wishlist.clear();
      saveWishlistToStorage();
      renderCardGrid();
      renderWishlistPage();
      showToast('Wishlist cleared.');
    }

    function getCollectorDisplayName(nameOrUsername) {
      if (!nameOrUsername) return nameOrUsername;
      const profile = getCollectorProfile(nameOrUsername);
      return (profile && profile.name) ? profile.name : nameOrUsername;
    }

    function getCollectorProfileMeta(nameOrUsername) {
      // Best-effort lookup of a collector's public profile fields (username,
      // bio, socials) so the read-only holder vault page can show a banner
      // similar to the owner's own My Vault tab.
      const profile = getCollectorProfile(nameOrUsername);
      return {
        displayName: (profile && profile.name) ? profile.name : nameOrUsername,
        username: profile && profile.username ? profile.username : null,
        bio: profile && profile.bio ? profile.bio : '',
        socialIg: profile && profile.socialIg ? profile.socialIg : '',
        socialTwitter: profile && profile.socialTwitter ? profile.socialTwitter : '',
        socialTiktok: profile && profile.socialTiktok ? profile.socialTiktok : '',
        socialWeb: profile && profile.socialWeb ? profile.socialWeb : ''
      };
    }

    let viewingHolderName = null;

    function openHolderVaultModal(ownerName) {
      viewingHolderName = ownerName;
      switchTab('holder-vault');
    }

    // ===== ADMIN: EDIT COLLECTOR DISPLAY NAME / AVATAR =====
    // Lets an admin correct a collector's shown name/photo (e.g. when the raw
    // `owner` value stored on cards is a username rather than the person's
    // real name) without touching card ownership records themselves. Writes
    // to the same "profiles" collection that a collector's own profile editor
    // uses, so getCollectorDisplayName()/getCollectorAvatar() pick it up everywhere.
    let adminEditingCollectorOwner = null;

    function openAdminEditCollectorModal(ownerName) {
      if (!currentUser || !currentUser.isAdmin) return showToast('Admin access required.');
      adminEditingCollectorOwner = ownerName;

      const profile = getCollectorProfile(ownerName);
      document.getElementById('admin-edit-collector-raw-id').innerText = ownerName;
      document.getElementById('admin-edit-collector-name-input').value = (profile && profile.name) || ownerName;
      document.getElementById('admin-edit-collector-avatar-input').value = (profile && profile.avatarUrl) || '';
      document.getElementById('admin-edit-collector-avatar-preview').src = getCollectorAvatar(ownerName);

      document.getElementById('admin-relink-search-input').value = '';
      filterRelinkAccountOptions();

      document.getElementById('admin-edit-collector-modal').classList.remove('hidden');
    }

    function filterRelinkAccountOptions() {
      const query = (document.getElementById('admin-relink-search-input')?.value || '').toLowerCase().trim();
      const listContainer = document.getElementById('admin-relink-account-list');
      if (!listContainer) return;

      const options = Object.entries(globalCollectorProfiles).map(([key, p]) => ({
        key,
        displayName: p.name || p.username || key,
        username: p.username || '',
        avatarUrl: p.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${key}`
      })).filter(o =>
        !query ||
        o.displayName.toLowerCase().includes(query) ||
        o.username.toLowerCase().includes(query) ||
        o.key.toLowerCase().includes(query)
      );

      if (options.length === 0) {
        listContainer.innerHTML = `<div class="p-3 text-center text-slate-500 text-[11px]">No matching registered accounts</div>`;
        return;
      }

      listContainer.innerHTML = options.map(o => {
        const canonicalId = (o.username || o.displayName).replace(/'/g, "\\'");
        const safeDisplayName = o.displayName.replace(/'/g, "\\'");
        return `
        <div onclick="confirmRelinkCollectorOwner('${canonicalId}', '${safeDisplayName}')" class="flex items-center gap-2 px-2 py-1.5 hover:bg-rose-500/10 cursor-pointer rounded-lg transition-colors">
          <img src="${o.avatarUrl}" class="w-6 h-6 rounded-full object-cover border border-slate-700 bg-slate-950 flex-shrink-0">
          <div class="text-[11px] min-w-0">
            <div class="font-bold text-white truncate">${o.displayName}</div>
            ${o.username ? `<div class="text-slate-500 font-mono text-[10px]">@${o.username}</div>` : ''}
          </div>
        </div>`;
      }).join('');
    }

    async function confirmRelinkCollectorOwner(canonicalIdentifier, displayName) {
      const rawOwner = adminEditingCollectorOwner;
      if (!rawOwner) return;
      if (!canonicalIdentifier) return showToast("That account has no name or username set — ask them to set one in their profile first.");

      const affectedCards = inventory.filter(c => c.owner === rawOwner);
      if (affectedCards.length === 0) return showToast('No cards found for this owner label.');

      const confirmed = confirm(`Relink ${affectedCards.length} card(s) currently listed under "${rawOwner}" to ${displayName} (@${canonicalIdentifier})?\n\nThis updates the actual ownership record on each card — not just the display — so ${displayName}'s own Vault will show them correctly.`);
      if (!confirmed) return;

      try {
        const batch = db.batch();
        affectedCards.forEach(c => {
          batch.update(db.collection("cards").doc(c.id), { owner: canonicalIdentifier });
        });
        await batch.commit();

        closeAdminEditCollectorModal();
        renderHoldersTable();
        showToast(`Relinked ${affectedCards.length} card(s) to ${displayName}.`);
        addNotification('Collector Relinked', `Relinked ${affectedCards.length} card(s) from "${rawOwner}" to the registered account of ${displayName}.`, 'fa-link text-rose-400');
      } catch (e) {
        showToast('Error relinking owner: ' + e.message);
      }
    }

    function closeAdminEditCollectorModal() {
      document.getElementById('admin-edit-collector-modal').classList.add('hidden');
      adminEditingCollectorOwner = null;
    }

    async function handleAdminEditCollectorAvatarUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await compressImageToDataUrl(file, 256, 0.82);
        document.getElementById('admin-edit-collector-avatar-input').value = dataUrl;
        document.getElementById('admin-edit-collector-avatar-preview').src = dataUrl;
      } catch (e) {
        showToast('Could not process that image: ' + e.message);
      }
    }

    async function saveAdminCollectorProfile() {
      if (!currentUser || !currentUser.isAdmin) return showToast('Admin access required.');
      const ownerName = adminEditingCollectorOwner;
      if (!ownerName) return;

      const newName = document.getElementById('admin-edit-collector-name-input').value.trim();
      if (!newName) return showToast('Please enter a display name.');
      const newAvatar = document.getElementById('admin-edit-collector-avatar-input').value.trim();

      // Reuse the collector's existing profile doc if one already matches this
      // owner identifier, so we update it in place instead of creating a
      // duplicate profile keyed differently.
      const existingKey = getCollectorProfileKey(ownerName);
      const existingProfile = existingKey ? globalCollectorProfiles[existingKey] : null;
      const docId = existingKey || ownerName.toLowerCase().trim().replace(/\s+/g, '_');

      const profilePayload = {
        name: newName,
        username: (existingProfile && existingProfile.username) || ownerName,
        avatarUrl: newAvatar || (existingProfile && existingProfile.avatarUrl) || '',
        bio: (existingProfile && existingProfile.bio) || '',
        isPlusMember: (existingProfile && existingProfile.isPlusMember) || false,
        socialIg: (existingProfile && existingProfile.socialIg) || '',
        socialTwitter: (existingProfile && existingProfile.socialTwitter) || '',
        socialTiktok: (existingProfile && existingProfile.socialTiktok) || '',
        socialWeb: (existingProfile && existingProfile.socialWeb) || '',
        uid: (existingProfile && existingProfile.uid) || null
      };

      try {
        await db.collection("profiles").doc(docId).set(profilePayload, { merge: true });
        // If this collector's record has a known uid — either because they've
        // logged in before (see handleUserSession) or their only record so
        // far was the legacy "users" doc itself — mirror the edit there too
        // so the two collections don't drift apart again.
        if (profilePayload.uid) await syncProfileToUsersDoc(profilePayload.uid, profilePayload);
        await loadCollectorProfiles();

        closeAdminEditCollectorModal();
        renderHoldersTable();
        if (viewingHolderName === ownerName) renderHolderVaultPage(ownerName);

        showToast(`Collector profile for "${ownerName}" updated.`);
        addNotification('Collector Profile Updated', `Admin updated the display name/avatar shown for "${ownerName}".`, 'fa-user-gear text-rose-400');
      } catch (e) {
        showToast('Error updating collector profile: ' + e.message);
      }
    }

    function renderHolderVaultPage(ownerName) {
      const grid = document.getElementById('holder-vault-page-grid');
      if (!grid || !ownerName) return;

      const canonicalProfile = getCanonicalCollectorIdentity(ownerName);
      const owned = inventory.filter(c => {
        if (c.owner === ownerName) return true;
        if (!canonicalProfile) return false;
        const cardProfile = getCanonicalCollectorIdentity(c.owner);
        return !!cardProfile && !!canonicalProfile.uid && cardProfile.uid === canonicalProfile.uid;
      });
      const meta = getCollectorProfileMeta(ownerName);
      const isAdmin = isUserAdmin(ownerName);

      document.getElementById('holder-vault-page-heading').innerText = currentLanguage === 'ID' ? `Brankas ${meta.displayName}` : `${meta.displayName}'s Vault`;
      document.getElementById('holder-vault-page-subheading').innerText = currentLanguage === 'ID' ? 'Tampilan baca-saja dari koleksi kolektor ini.' : "Read-only view of this collector's binder.";
      document.getElementById('holder-vault-back-btn-label').innerText = currentLanguage === 'ID' ? 'Kembali ke Kolektor' : 'Back to Holders';

      // Social banner
      const banner = document.getElementById('holder-vault-page-banner');
      banner.classList.remove('hidden');
      document.getElementById('holder-vault-page-avatar').src = getCollectorAvatar(ownerName);
      document.getElementById('holder-vault-page-name').innerText = meta.displayName;
      document.getElementById('holder-vault-page-username').innerText = meta.username ? `@${meta.username}` : (isAdmin ? 'Admin' : '');

      const adminEditWrap = document.getElementById('holder-vault-page-admin-edit-wrap');
      if (adminEditWrap) {
        if (currentUser && currentUser.isAdmin) adminEditWrap.classList.remove('hidden');
        else adminEditWrap.classList.add('hidden');
      }
      document.getElementById('holder-vault-page-bio').innerText = meta.bio || (isAdmin ? 'Official Platform Admin' : (currentLanguage === 'ID' ? 'Kolektor' : 'Collector Vault'));

      const linksContainer = document.getElementById('holder-vault-page-links');
      let linksHtml = '';
      if (meta.socialIg) {
        const href = meta.socialIg.startsWith('http') ? meta.socialIg : `https://instagram.com/${meta.socialIg.replace('@', '')}`;
        linksHtml += `<a href="${href}" target="_blank" class="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-rose-400 text-xs rounded-xl transition-all" title="Instagram"><i class="fa-brands fa-instagram"></i></a>`;
      }
      if (meta.socialTwitter) {
        const href = meta.socialTwitter.startsWith('http') ? meta.socialTwitter : `https://x.com/${meta.socialTwitter.replace('@', '')}`;
        linksHtml += `<a href="${href}" target="_blank" class="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs rounded-xl transition-all" title="X / Twitter"><i class="fa-brands fa-x-twitter"></i></a>`;
      }
      if (meta.socialTiktok) {
        const href = meta.socialTiktok.startsWith('http') ? meta.socialTiktok : `https://tiktok.com/@${meta.socialTiktok.replace('@', '')}`;
        linksHtml += `<a href="${href}" target="_blank" class="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-cyan-400 text-xs rounded-xl transition-all" title="TikTok"><i class="fa-brands fa-tiktok"></i></a>`;
      }
      if (meta.socialWeb) {
        const href = meta.socialWeb.startsWith('http') ? meta.socialWeb : `https://${meta.socialWeb}`;
        linksHtml += `<a href="${href}" target="_blank" class="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-indigo-400 text-xs rounded-xl transition-all" title="Website"><i class="fa-solid fa-globe"></i></a>`;
      }
      linksContainer.innerHTML = linksHtml || `<span class="text-[10px] text-slate-600 italic">${currentLanguage === 'ID' ? 'Belum ada tautan sosial' : 'No social links added'}</span>`;

      // Collector level panel
      const dict = i18nDict[currentLanguage];
      const pseudoUser = { name: ownerName, username: ownerName };
      const tradesCompleted = getCollectorTradesCompleted(pseudoUser);
      const collectionValue = owned.reduce((sum, c) => sum + (c.price || 0), 0);
      const { level, pct, title } = computeCollectorLevel(owned.length, tradesCompleted);

      document.getElementById('holder-vault-level-panel').classList.remove('hidden');
      document.getElementById('holder-vault-level-ring').style.setProperty('--pct', pct);
      document.getElementById('holder-vault-level-number').innerText = level;
      document.getElementById('holder-vault-level-title').innerText = title;
      document.getElementById('holder-vault-level-progress-fill').style.width = `${pct}%`;
      document.getElementById('holder-vault-stat-cards-owned').innerText = owned.length;
      document.getElementById('holder-vault-stat-trades').innerText = tradesCompleted;
      document.getElementById('holder-vault-stat-value').innerText = formatIDR(collectionValue);

      const hasLowSerial = owned.some(c => (parseInt((c.sn || '999').replace(/\D/g, ''), 10) || 999) <= 5);
      const hasPremium = owned.some(c => c.type === 'PREMIUM');
      const badges = [
        { earned: owned.length >= 1, label: dict.badgeCollector, icon: 'fa-star', cls: 'badge-cyan' },
        { earned: hasLowSerial, label: dict.badgeGenesis, icon: 'fa-trophy', cls: 'badge-gold' },
        { earned: tradesCompleted >= 5, label: dict.badgeActiveTrader, icon: 'fa-fire', cls: 'badge-rose' },
        { earned: hasPremium, label: dict.badgePremiumHolder, icon: 'fa-gem', cls: 'badge-gold' },
      ];
      document.getElementById('holder-vault-badges-row').innerHTML = badges.map(b => `
        <span class="badge-chip ${b.earned ? b.cls : 'badge-locked'}">
          <i class="fa-solid ${b.earned ? b.icon : 'fa-lock'}"></i> ${b.label}
        </span>
      `).join('');

      // Collection completion panel
      const totalCards = inventory.length || 50;
      const ownedIds = new Set(owned.map(c => c.id));
      const missing = inventory.filter(c => !ownedIds.has(c.id));
      const completionPct = totalCards > 0 ? Math.round((owned.length / totalCards) * 100) : 0;

      document.getElementById('holder-vault-completion-panel').classList.remove('hidden');
      document.getElementById('holder-vault-completion-pct').innerText = `${completionPct}%`;
      document.getElementById('holder-vault-completion-fill').style.width = `${completionPct}%`;
      document.getElementById('holder-vault-completion-count').innerHTML = `<span>${dict.collectionCompletionCollected}</span>: ${owned.length} / ${totalCards}`;

      const missingEl = document.getElementById('holder-vault-completion-missing');
      if (missing.length === 0) {
        missingEl.innerHTML = '';
      } else {
        const shown = missing.slice(0, 8).map(c => `<span class="inline-block bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[10px] text-amber-400 mr-1 mb-1">${c.serial}</span>`).join('');
        const extra = missing.length > 8 ? `<span class="text-slate-500">+${missing.length - 8} ${dict.collectionCompletionMissingMore}</span>` : '';
        missingEl.innerHTML = `<span class="text-slate-500 font-bold uppercase text-[9px] tracking-wider block mb-1">${dict.collectionCompletionMissing}</span>${shown}${extra}`;
      }

      // Card grid - read-only, same layout as My Vault but without owner-only actions
      if (owned.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-slate-500 text-xs">${currentLanguage === 'ID' ? 'Brankas kolektor ini masih kosong.' : "This collector's vault is empty."}</div>`;
        return;
      }

      grid.innerHTML = owned.map(card => `
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between relative shadow-xl hover:border-amber-500/40 transition-all">
          <div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${card.type === 'PREMIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}">${card.type}</span>
              <span class="text-[10px] font-mono text-emerald-400 font-extrabold">${formatIDR(card.price)}</span>
            </div>

            <div class="w-full aspect-[4/5] bg-slate-950 rounded-2xl border border-slate-800 p-2 flex flex-col justify-between mb-3 text-center overflow-hidden">
              <div class="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden">
                <img src="${card.imgUrl}" loading="lazy" class="w-full h-full object-contain">
              </div>
            </div>

            <p class="text-center font-black text-amber-400 font-mono serial-engraved text-base">${card.serial}</p>
            <p class="text-xs font-extrabold text-white text-center truncate mb-1">${card.name}</p>
          </div>

          <button onclick="openDirectChat('${ownerName}', 'Collector Inquiry')" class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-comments"></i> ${currentLanguage === 'ID' ? 'Chat Kolektor' : 'Chat Collector'}
          </button>
        </div>
      `).join('');
    }

    function renderHoldersTable() {
      const grid = document.getElementById('holders-directory-grid');
      if (!grid) return;

      // Group cards by canonical collector identity, not by the mutable owner
      // label stored on older cards. This makes "Stellar", "stellar", and a
      // UID-backed owner resolve to the same holder when they represent one
      // Firebase account.
      const holdersMap = {};
      inventory.forEach(c => {
        if (!c.owner) return;
        const profile = getCanonicalCollectorIdentity(c.owner);
        const groupKey = getCanonicalCollectorKey(c.owner);
        if (!holdersMap[groupKey]) {
          holdersMap[groupKey] = {
            profile: profile || null,
            cards: [],
            ownerName: profile?.username || profile?.name || c.owner,
            rawOwners: new Set()
          };
        }
        holdersMap[groupKey].cards.push(c);
        holdersMap[groupKey].rawOwners.add(c.owner);
        if (!holdersMap[groupKey].profile && profile) holdersMap[groupKey].profile = profile;
        if (profile) holdersMap[groupKey].ownerName = profile.username || profile.name || c.owner;
      });

      const entries = Object.entries(holdersMap);

      const statCount = document.getElementById('holders-stat-count');
      const statCards = document.getElementById('holders-stat-cards');
      if (statCount) statCount.innerText = entries.length;
      if (statCards) statCards.innerText = entries.reduce((sum, [, holder]) => sum + holder.cards.length, 0);

      if (entries.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-slate-500 text-xs">${currentLanguage === 'ID' ? 'Belum ada kolektor sekunder eksternal terdaftar. Semua stok masih di rumah utama.' : 'No external secondary holders registered yet. All stock with primary house.'}</div>`;
        return;
      }

      entries.sort((a, b) => b[1].cards.length - a[1].cards.length);

      grid.innerHTML = entries.map(([groupKey, holder]) => {
        const cards = holder.cards;
        const ownerName = holder.ownerName;
        const serialsList = cards.map(c => `<span class="inline-block bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-400">${c.serial}</span>`).join('');
        const avatarUrl = holder.profile?.avatarUrl || getCollectorAvatar(ownerName);
        const isAdmin = isUserAdmin(ownerName) || !!holder.profile?.isAdmin;
        const displayName = holder.profile?.name || getCollectorDisplayName(ownerName);
        const cardsHeldLabel = currentLanguage === 'ID' ? `${cards.length} kartu dimiliki` : `${cards.length} cards held`;
        const cardsOwnedLabel = currentLanguage === 'ID' ? 'Kartu Dimiliki' : 'Cards Owned';
        const serialsHeldLabel = currentLanguage === 'ID' ? 'Serial yang Dimiliki' : 'Serials Held';
        const viewVaultLabel = currentLanguage === 'ID' ? 'Lihat Brankas' : 'View Vault';
        const chatCollectorLabel = currentLanguage === 'ID' ? 'Chat Kolektor' : 'Chat Collector';
        const collectorInquiryContext = currentLanguage === 'ID' ? 'Pertanyaan Kolektor' : 'Collector Inquiry';
        const safeOwner = String(ownerName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        return `
          <div class="premium-panel rounded-3xl p-5 flex flex-col gap-4 border border-slate-800/60 hover:border-teal-500/40 transition-all">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-3 min-w-0">
                <img src="${avatarUrl}" class="w-11 h-11 rounded-2xl object-cover border border-slate-700 bg-slate-950 shrink-0">
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-extrabold text-white text-xs truncate">${displayName}</span>
                    ${isAdmin ? `<span class="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">ADMIN</span>` : ''}
                  </div>
                  <span class="text-[10px] text-slate-500">${cardsHeldLabel}</span>
                </div>
              </div>
              ${currentUser && currentUser.isAdmin ? `
              <button onclick="openAdminEditCollectorModal('${safeOwner}')" title="Admin: Edit collector profile" class="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 transition-all">
                <i class="fa-solid fa-user-pen text-[11px]"></i>
              </button>` : ''}
            </div>

            <div class="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-2xl px-3 py-2">
              <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">${cardsOwnedLabel}</span>
              <span class="font-mono font-black text-teal-400 text-sm">${cards.length}</span>
            </div>

            <div>
              <p class="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">${serialsHeldLabel}</p>
              <div class="flex flex-wrap gap-1">${serialsList}</div>
            </div>

            <div class="flex gap-2 pt-1 mt-auto">
              <button onclick="openHolderVaultModal('${safeOwner}')" class="flex-1 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-[10px] rounded-xl border border-amber-500/30 transition-all inline-flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-vault"></i> ${viewVaultLabel}
              </button>
              <button onclick="openDirectChat('${safeOwner}', '${collectorInquiryContext}')" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded-xl shadow transition-all inline-flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-comments"></i> ${chatCollectorLabel}
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function loadPendingTransactions() {
      if (!currentUser?.isAdmin) return;
      const container = document.getElementById('admin-pending-orders-list');
      if (!container) return;

      try {
        const snapshot = await db.collection("transactions").where("status", "==", "PENDING").get();
        if (snapshot.empty) {
          container.innerHTML = `<p class="text-xs text-slate-500" data-i18n="noPendingOrders">No pending transactions requiring approval.</p>`;
          return;
        }

        const pendingList = [];
        snapshot.forEach(doc => pendingList.push({ id: doc.id, ...doc.data() }));

        container.innerHTML = pendingList.map(tx => {
          const isSellback = tx.type === 'SELLBACK';
          if (tx.qrisProofUrl) proofUrlById[tx.id] = tx.qrisProofUrl;
          const proofButton = tx.qrisProofUrl
            ? `<button type="button" onclick="viewTransactionProof('${tx.id}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 text-[10px] font-bold rounded-lg border border-slate-700 inline-flex items-center gap-1"><i class="fa-solid fa-image"></i> View Payment Proof</button>`
            : `<span class="text-slate-500 text-[10px]">No Proof File Attached</span>`;

          return `
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div class="flex justify-between items-start">
                <div>
                  <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full ${isSellback ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}">${isSellback ? 'SELLBACK REQUEST' : 'PURCHASE ORDER'}</span>
                  <h4 class="font-extrabold text-white text-xs mt-1">Ref: ${tx.id} • Buyer/Seller: ${tx.user_name}</h4>
                </div>
                <span class="font-mono text-emerald-400 font-black text-sm">${formatIDR(tx.total_amount)}</span>
              </div>

              <div class="flex items-center justify-between text-xs">
                <div>${proofButton}</div>
                <div class="flex gap-2">
                  <button onclick="approveTransaction('${tx.id}')" class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow transition-all"><i class="fa-solid fa-check mr-1"></i> Approve</button>
                  <button onclick="rejectTransaction('${tx.id}')" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 font-bold text-xs rounded-xl transition-all"><i class="fa-solid fa-xmark mr-1"></i> Reject</button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      } catch (e) {
        console.warn('Load pending tx error:', e);
      }
    }

    async function approveTransaction(txId) {
      if (!currentUser?.isAdmin) return showToast('Admin access required.');

      try {
        const doc = await db.collection("transactions").doc(txId).get();
        if (!doc.exists) return showToast('Transaction doc not found.');
        const tx = doc.data();

        const batch = db.batch();
        const txRef = db.collection("transactions").doc(txId);
        batch.update(txRef, { status: 'APPROVED' });

        if (Array.isArray(tx.items)) {
          tx.items.forEach(item => {
            const cardRef = db.collection("cards").doc(item.id);
            if (tx.type === 'SELLBACK') {
              batch.update(cardRef, { owner: null, status: 'AVAILABLE' });
            } else {
              batch.update(cardRef, { owner: tx.user_name, status: 'SOLD' });
            }
          });
        }

        await batch.commit();

        showToast(`Transaction ${txId} approved! Ownership updated.`);
        addNotification('Transaction Approved', `Approved ${txId} for ${tx.user_name}.`, 'fa-circle-check text-emerald-400');

        await loadAppState();
      } catch (e) {
        showToast('Approval error: ' + e.message);
      }
    }

    async function rejectTransaction(txId) {
      if (!currentUser?.isAdmin) return showToast('Admin access required.');

      try {
        await db.collection("transactions").doc(txId).update({ status: 'REJECTED' });
        showToast(`Transaction ${txId} rejected.`);
        addNotification('Transaction Rejected', `Rejected transaction ${txId}.`, 'fa-xmark text-rose-400');
        await loadAppState();
      } catch (e) {
        showToast('Rejection error: ' + e.message);
      }
    }

    function refreshAdminHub() {
      loadPendingTransactions();
      showToast('Admin Hub refreshed.');
    }

    function addToCart(cardId) {
      const card = inventory.find(c => c.id === cardId);
      if (!card || card.status === 'SOLD') return showToast('Card is unavailable or sold.');

      if (cart.some(i => i.id === cardId)) return showToast('Card is already in your cart.');

      cart.push(card);
      saveCartToStorage();
      updateCartTotals();
      showToast(`Added ${card.serial} to cart!`);
    }

    function removeFromCart(cardId) {
      cart = cart.filter(i => i.id !== cardId);
      saveCartToStorage();
      updateCartTotals();
      renderCartItems();
    }

    function updateCartTotals() {
      const badge = document.getElementById('cart-badge-count');
      if (badge) badge.innerText = cart.length;

      const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
      const tax = subtotal * TRADE_FEE_PERCENT;
      const total = subtotal + tax;

      document.getElementById('cart-subtotal').innerText = formatIDR(subtotal);
      document.getElementById('cart-tax').innerText = formatIDR(tax);
      document.getElementById('cart-grand-total').innerText = formatIDR(total);
      document.getElementById('qris-amount-display').innerText = formatIDR(total);
    }

    function toggleCartDrawer() {
      const drawer = document.getElementById('cart-drawer');
      const overlay = document.getElementById('cart-drawer-overlay');
      if (!drawer || !overlay) return;

      if (drawer.classList.contains('translate-x-full')) {
        renderCartItems();
        drawer.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
      } else {
        drawer.classList.add('translate-x-full');
        overlay.classList.add('hidden');
      }
    }

    function renderCartItems() {
      const container = document.getElementById('cart-items-container');
      if (!container) return;

      if (cart.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 text-center py-10">Your cart is currently empty.</p>`;
        return;
      }

      container.innerHTML = cart.map(item => `
        <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-3">
            <img src="${item.imgUrl}" class="w-10 h-10 object-contain rounded bg-slate-900 border border-slate-800 p-0.5">
            <div>
              <p class="font-bold text-white">${item.name} (${item.serial})</p>
              <p class="font-mono text-emerald-400 font-extrabold">${formatIDR(item.price)}</p>
            </div>
          </div>
          <button onclick="removeFromCart('${item.id}')" class="w-7 h-7 rounded-xl bg-slate-900 text-slate-500 hover:text-rose-400 flex items-center justify-center transition-colors"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `).join('');
    }

    function proceedToCheckout() {
      if (!currentUser) {
        toggleCartDrawer();
        openAuthModal();
        return showToast('Please log in before proceeding to payment.');
      }

      if (cart.length === 0) return showToast('Your cart is empty.');

      const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
      const total = subtotal * 1.02;

      const qrisImg = document.getElementById('qris-img-element');
      if (qrisImg) {
        qrisImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(OFFICIAL_QRIS_STRING)}`;
      }

      document.getElementById('qris-amount-display').innerText = formatIDR(total);
      document.getElementById('qris-proof-img-data').value = '';
      document.getElementById('qris-proof-file-input').value = '';
      document.getElementById('qris-proof-preview-container').classList.add('hidden');

      toggleCartDrawer();
      switchCheckoutMethod('QRIS');
      document.getElementById('checkout-modal').classList.remove('hidden');
    }

    function closeCheckoutModal() { document.getElementById('checkout-modal').classList.add('hidden'); }

    async function submitOrderWithProof() {
      if (!currentUser) return showToast('Please log in.');
      if (cart.length === 0) return showToast('Your cart is empty.');

      const proofImgData = document.getElementById('qris-proof-img-data').value;
      if (!proofImgData) return showToast('Please attach a screenshot of your transfer receipt.');

      const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
      const total = subtotal * 1.02;
      const orderRef = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      const activeUserIdent = currentUser.username || currentUser.name;

      const orderData = {
        id: orderRef,
        type: 'BUY',
        paymentMethod: activePaymentMethod,
        user_name: activeUserIdent,
        items: cart.map(i => ({ id: i.id, serial: i.serial, name: i.name, price: i.price })),
        subtotal: subtotal,
        tax: subtotal * 0.02,
        total_amount: total,
        qrisProofUrl: proofImgData,
        status: 'PENDING',
        created_at: new Date().toISOString()
      };

      try {
        await db.collection("transactions").doc(orderRef).set(orderData);

        sendAdminApprovalEmail({
          order_id: orderRef,
          order_type: 'BUY',
          user_name: activeUserIdent,
          amount: formatIDR(total),
          detail: `Purchase order: ${cart.map(i => i.serial).join(', ')}`
        });

        cart = [];
        saveCartToStorage();
        updateCartTotals();

        closeCheckoutModal();
        showToast(`Order ${orderRef} submitted! Pending Admin verification.`);
        addNotification('Order Submitted', `Submitted purchase order ${orderRef} for Admin approval.`, 'fa-cart-check text-emerald-400');

        switchTab('history');
      } catch (e) {
        showToast('Order submission error: ' + e.message);
      }
    }

    function switchTab(tabName) {
      if (tabName === 'dashboard') setTimeout(renderCollectorReputationPanel, 50);
      if (tabName === 'catalog') setTimeout(renderMarketIntelligence, 50);
      ['home', 'catalog', 'trade', 'auction', 'trade-req', 'analytics', 'revenue', 'inbox', 'holders', 'holder-vault', 'history', 'dashboard', 'wishlist', 'inventory', 'admin'].forEach(t => {
        const view = document.getElementById(`view-${t}`);
        const navBtn = document.getElementById(`nav-${t}`);

        if (view) {
          if (t === tabName) view.classList.remove('hidden');
          else view.classList.add('hidden');
        }

        if (navBtn) {
          if (t === tabName) {
            navBtn.className = navBtn.className.replace('text-slate-400', 'text-white bg-slate-800 shadow-sm');
          } else {
            navBtn.className = navBtn.className.replace('text-white bg-slate-800 shadow-sm', 'text-slate-400');
          }
        }
      });

      if (tabName === 'home') { renderHomeMembersList(); renderPostsFeed(); refreshHomeComposerState(); }
      if (tabName === 'catalog') { renderCardGrid(); renderHomepageHighlights(); }
      if (tabName === 'trade') renderP2PListings();
      if (tabName === 'auction') renderAuctionView();
      if (tabName === 'trade-req') renderTradeRequests();
      if (tabName === 'analytics') renderMarketAnalytics();
      if (tabName === 'revenue') renderRevenueTab();
      if (tabName === 'inbox') loadUserInboxThreads();
      if (tabName === 'holders') renderHoldersTable();
      if (tabName === 'holder-vault') renderHolderVaultPage(viewingHolderName);
      if (tabName === 'history') fetchTransactionHistory();
      if (tabName === 'dashboard') renderOwnedCards();
      if (tabName === 'wishlist') renderWishlistPage();
      if (tabName === 'inventory') renderInventoryTable();
      if (tabName === 'admin') loadPendingTransactions();
    }

    function formatIDR(num) {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num || 0);
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toast-msg');
      if (!toast || !toastMsg) return;

      toastMsg.innerText = msg;
      toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');

      setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
      }, 3000);
    }
  

(function eugeneCatalogKeyboardShortcut(){
  document.addEventListener('keydown', function(e){
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      const input = document.getElementById('search-input');
      if (input && !input.closest('.hidden')) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    }
  });
})();
