
'use strict';

/* ==========================================
   SONI FAST FOOD - WEBSITE APP
   Fixed service status + ordering
========================================== */

const $ = selector => document.querySelector(selector);

const defaultMenu = [
  {
    id: 'pizza',
    name: 'Veg Pizza',
    category: 'Pizza',
    price: 199,
    emoji: '🍕',
    description: 'Cheesy, fresh and delicious'
  },
  {
    id: 'burger',
    name: 'Veg Burger',
    category: 'Burger',
    price: 89,
    emoji: '🍔',
    description: 'Crispy and freshly prepared'
  },
  {
    id: 'fries',
    name: 'French Fries',
    category: 'Fries',
    price: 79,
    emoji: '🍟',
    description: 'Golden and crunchy'
  },
  {
    id: 'momo',
    name: 'Steam Momos',
    category: 'Momo',
    price: 99,
    emoji: '🥟',
    description: 'Served with spicy chutney'
  },
  {
    id: 'sandwich',
    name: 'Grilled Sandwich',
    category: 'Sandwich',
    price: 119,
    emoji: '🥪',
    description: 'Toasted to perfection'
  }
];

let items = defaultMenu;
let cart = {};
let locationPin = null;
let category = 'All';
let slots = [];

let deliveryEnabled = false;
let dineEnabled = false;
let backendReady = false;

let pendingDeliveryRequest = null;
let pendingDineRequest = null;


/* ==========================================
   HELPERS
========================================== */

const money = n =>
  '₹' + Number(n).toFixed(0);

const escapeHtml = value =>
  String(value).replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );

function isEnabled(value) {
  return String(value)
    .trim()
    .toUpperCase() === 'TRUE';
}

function indiaTomorrow() {
  const parts = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
  ).formatToParts(new Date());

  const o = Object.fromEntries(
    parts.map(p => [p.type, p.value])
  );

  const d = new Date(
    Date.UTC(
      Number(o.year),
      Number(o.month) - 1,
      Number(o.day) + 1
    )
  );

  return d.toISOString().slice(0, 10);
}

function newRequestId() {
  if (
    !window.crypto ||
    typeof crypto.randomUUID !== 'function'
  ) {
    throw Error(
      'Secure browser context required. Open the HTTPS website.'
    );
  }

  return crypto.randomUUID();
}

function showStatus(selector, message) {
  const el = $(selector);

  if (el) {
    el.textContent = message;
  }
}


/* ==========================================
   SERVICE STATUS CONTROL
========================================== */

function updateServiceButtons() {
  const deliveryButton =
    $('#checkout button[type="submit"]');

  const dineButton =
    $('#dineForm button[type="submit"]');

  if (deliveryButton) {
    deliveryButton.disabled =
      !backendReady || !deliveryEnabled;

    deliveryButton.textContent =
      !backendReady
        ? 'Service Unavailable'
        : deliveryEnabled
          ? 'Place Order Request'
          : 'Home Delivery Closed';
  }

  if (dineButton) {
    dineButton.disabled =
      !backendReady || !dineEnabled;

    dineButton.textContent =
      !backendReady
        ? 'Service Unavailable'
        : dineEnabled
          ? 'Continue to Booking'
          : 'Dine-in Booking Closed';
  }
}

function updateServiceNotice() {
  if (!backendReady) {
    showStatus(
      '#serviceNotice',
      'Unable to connect to ordering service.'
    );

    return;
  }

  const deliveryText = deliveryEnabled
    ? 'OPEN'
    : 'CLOSED';

  const dineText = dineEnabled
    ? 'OPEN'
    : 'CLOSED';

  showStatus(
    '#serviceNotice',
    'Home Delivery: ' + deliveryText +
    ' | Dine-in Booking: ' + dineText
  );
}


/* ==========================================
   MENU RENDERING
========================================== */

function draw() {
  const categories = [
    'All',
    ...new Set(items.map(i => i.category))
  ];

  $('#categories').innerHTML = categories
    .map(c => `
      <button
        class="chip ${category === c ? 'active' : ''}"
        data-cat="${escapeHtml(c)}"
      >
        ${escapeHtml(c)}
      </button>
    `)
    .join('');

  $('#products').innerHTML = items
    .filter(i =>
      category === 'All' ||
      i.category === category
    )
    .map(i => {
      const available =
        i.active !== false &&
        Number(i.stock ?? 999999) > 0;

      return `
        <article class="product">

          <div class="foodicon">
            ${escapeHtml(i.emoji || '🍽️')}
          </div>

          <h3>${escapeHtml(i.name)}</h3>

          <p>
            ${escapeHtml(
              i.description || 'Freshly prepared'
            )}
          </p>

          <div class="productbottom">
            <strong>${money(i.price)}</strong>

            <button
              data-add="${escapeHtml(i.id)}"
              ${!available || !deliveryEnabled
                ? 'disabled'
                : ''}
            >
              ${!available
                ? 'Out of stock'
                : !deliveryEnabled
                  ? 'Delivery Closed'
                  : '+ Add'}
            </button>
          </div>

        </article>
      `;
    })
    .join('');

  $('#dineItem').innerHTML =
    '<option value="">Select food</option>' +
    items
      .filter(i =>
        i.active !== false &&
        Number(i.stock ?? 999999) > 0
      )
      .map(i => `
        <option value="${escapeHtml(i.id)}">
          ${escapeHtml(i.name)} · ${money(i.price)}
        </option>
      `)
      .join('');
}


/* ==========================================
   CART
========================================== */

function cartEntries() {
  return Object.entries(cart)
    .filter(([id, quantity]) =>
      quantity > 0 &&
      items.some(i => i.id === id)
    );
}

function drawCart() {
  const entries = cartEntries();

  $('#cartCount').textContent =
    entries.reduce(
      (sum, [, quantity]) => sum + quantity,
      0
    );

  $('#cartItems').innerHTML = entries.length
    ? entries.map(([id, quantity]) => {
        const item = items.find(i => i.id === id);

        return `
          <div class="cartrow">

            <div>
              <b>${escapeHtml(item.name)}</b>
              <div class="muted">
                ${money(item.price)} each
              </div>
            </div>

            <div class="qty">
              <button
                data-qty="${escapeHtml(id)}"
                data-delta="-1"
              >−</button>

              <b>${quantity}</b>

              <button
                data-qty="${escapeHtml(id)}"
                data-delta="1"
              >+</button>
            </div>

          </div>
        `;
      }).join('')
    : '<p class="muted">Your cart is empty.</p>';

  const subtotal = entries.reduce(
    (sum, [id, quantity]) => {
      const item = items.find(i => i.id === id);

      return sum + item.price * quantity;
    },
    0
  );

  $('#subtotal').textContent = money(subtotal);
}

function openCart(show) {
  $('#drawer').classList.toggle('open', show);

  $('#drawer').setAttribute(
    'aria-hidden',
    String(!show)
  );

  $('#overlay').hidden = !show;
}


/* ==========================================
   API
========================================== */

async function api(action, data = {}) {
  const url = window.SFF_CONFIG?.API_URL;

  if (!url) {
    throw Error(
      'Restaurant backend is not configured.'
    );
  }

  const response = await fetch(url, {
    method: 'POST',

    headers: {
      'Content-Type':
        'text/plain;charset=utf-8'
    },

    body: JSON.stringify({
      action,
      ...data
    }),

    redirect: 'follow'
  });

  if (!response.ok) {
    throw Error(
      'Backend unavailable. HTTP ' +
      response.status
    );
  }

  const result = await response.json();

  if (!result.ok) {
    throw Error(
      result.error || 'Request failed'
    );
  }

  return result;
}


/* ==========================================
   LOAD LIVE SETTINGS
========================================== */

async function load() {
  backendReady = false;
  deliveryEnabled = false;
  dineEnabled = false;

  updateServiceButtons();
  draw();

  if (!window.SFF_CONFIG?.API_URL) {
    showStatus(
      '#serviceNotice',
      'Backend not configured. Online ordering disabled.'
    );

    return;
  }

  try {
    const out = await api('getPublicConfig');

    if (!Array.isArray(out.menu)) {
      throw Error('Invalid menu response');
    }

    items = out.menu;
    category = 'All';

    slots = Array.isArray(out.slots)
      ? out.slots
      : [];

    deliveryEnabled =
      isEnabled(out.deliveryEnabled);

    dineEnabled =
      isEnabled(out.dineEnabled);

    backendReady = true;

    // Remove unavailable products from cart.
    for (const id of Object.keys(cart)) {
      const item = items.find(i => i.id === id);

      if (
        !item ||
        item.active === false ||
        Number(item.stock) < cart[id]
      ) {
        delete cart[id];
      }
    }

    $('#dineSlot').innerHTML =
      '<option value="">Select slot</option>' +
      slots.map(slot => `
        <option value="${escapeHtml(slot)}">
          ${escapeHtml(slot)}
        </option>
      `).join('');

    draw();
    drawCart();
    updateServiceButtons();
    updateServiceNotice();

    console.log(
      'SONI FAST FOOD Backend Connected',
      {
        deliveryEnabled,
        dineEnabled,
        menuCount: items.length
      }
    );

  } catch (error) {
    backendReady = false;
    deliveryEnabled = false;
    dineEnabled = false;

    updateServiceButtons();
    draw();

    showStatus(
      '#serviceNotice',
      'Unable to load live menu: ' +
      error.message
    );

    console.error(
      'Backend connection failed:',
      error
    );
  }
}


/* ==========================================
   CLICK EVENTS
========================================== */

document.addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  const cat = event.target.closest('[data-cat]');
  const qty = event.target.closest('[data-qty]');

  if (add) {
    if (!backendReady || !deliveryEnabled) {
      showStatus(
        '#serviceNotice',
        'Home Delivery is currently closed.'
      );
      return;
    }

    const id = add.dataset.add;
    const item = items.find(i => i.id === id);

    if (
      !item ||
      item.active === false
    ) {
      return;
    }

    const current = cart[id] || 0;
    const maxStock = Number(item.stock);

    if (current >= Math.min(20, maxStock)) {
      alert('Maximum available quantity reached.');
      return;
    }

    cart[id] = current + 1;

    drawCart();
    openCart(true);
  }

  if (cat) {
    category = cat.dataset.cat;
    draw();
  }

  if (qty) {
    const id = qty.dataset.qty;
    const item = items.find(i => i.id === id);

    if (!item) {
      return;
    }

    const delta = Number(qty.dataset.delta);

    const current = cart[id] || 0;

    const maxQuantity = Math.min(
      20,
      Math.max(0, Number(item.stock))
    );

    cart[id] = Math.max(
      0,
      Math.min(
        maxQuantity,
        current + delta
      )
    );

    if (cart[id] === 0) {
      delete cart[id];
    }

    drawCart();
  }
});


/* ==========================================
   CART CONTROLS
========================================== */

$('#cartToggle').onclick = () =>
  openCart(true);

$('#closeCart').onclick = () =>
  openCart(false);

$('#overlay').onclick = () =>
  openCart(false);

$('#year').textContent =
  new Date().getFullYear();

$('#dineDate').value = indiaTomorrow();


/* ==========================================
   GPS
========================================== */

$('#locate').onclick = () => {
  if (!navigator.geolocation) {
    showStatus(
      '#locationStatus',
      'GPS is not supported on this device.'
    );
    return;
  }

  showStatus(
    '#locationStatus',
    'Requesting location permission…'
  );

  navigator.geolocation.getCurrentPosition(
    position => {
      locationPin = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      showStatus(
        '#locationStatus',
        'GPS captured. Please confirm your delivery address.'
      );
    },

    error => {
      locationPin = null;

      showStatus(
        '#locationStatus',
        'GPS unavailable: ' + error.message
      );
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
};


/* ==========================================
   HOME DELIVERY CHECKOUT
========================================== */

$('#checkout').onsubmit = async event => {
  event.preventDefault();

  const status = $('#orderStatus');
  const button = event.target.querySelector(
    '[type="submit"]'
  );

  if (!backendReady || !deliveryEnabled) {
    status.textContent =
      'Home Delivery is currently closed.';
    return;
  }

  const entries = cartEntries();

  if (!entries.length) {
    status.textContent =
      'Add at least one food item.';
    return;
  }

  if (!locationPin) {
    status.textContent =
      'Please capture your GPS location first.';
    return;
  }

  const form = new FormData(event.target);

  const name = String(
    form.get('name') || ''
  ).trim();

  const mobile = String(
    form.get('mobile') || ''
  ).trim();

  const address = String(
    form.get('address') || ''
  ).trim();

  const landmark = String(
    form.get('landmark') || ''
  ).trim();

  const paymentMode = String(
    form.get('paymentMode') || ''
  );

  if (!name || !address) {
    status.textContent =
      'Enter your name and delivery address.';
    return;
  }

  if (!/^[6-9][0-9]{9}$/.test(mobile)) {
    status.textContent =
      'Enter a valid 10-digit Indian mobile number.';
    return;
  }

  if (
    !['COD', 'UPI_MANUAL'].includes(paymentMode)
  ) {
    status.textContent =
      'Select a valid payment method.';
    return;
  }

  const payload = {
    customer: {
      name,
      mobile,
      address,
      landmark,
      ...locationPin
    },

    paymentMode,

    items: entries.map(([id, quantity]) => ({
      id,
      quantity
    }))
  };

  // Reuse request ID after a failed/uncertain
  // response, unless order details change.
  const signature = JSON.stringify(payload);

  if (
    !pendingDeliveryRequest ||
    pendingDeliveryRequest.signature !== signature
  ) {
    pendingDeliveryRequest = {
      signature,
      requestId: newRequestId()
    };
  }

  button.disabled = true;

  status.textContent =
    'Submitting your order…';

  try {
    const out = await api(
      'createDeliveryOrder',
      {
        requestId:
          pendingDeliveryRequest.requestId,
        ...payload
      }
    );

    status.textContent =
      'Order request created: ' +
      out.orderId +
      '. Total: ' +
      money(out.total) +
      '. Status: ' +
      out.status +
      '. Please save this Order ID.';

    if(out.trackingToken){
      const details={orderId:out.orderId,trackingToken:out.trackingToken};
      try{localStorage.setItem('sff_last_tracking',JSON.stringify(details));}catch(_){}
      const link=new URL(window.location.href.split('#')[0]);
      link.hash='tracking';link.searchParams.set('order',out.orderId);link.searchParams.set('key',out.trackingToken);
      const anchor=document.createElement('a');anchor.href=link.href;anchor.textContent=' Open private tracking link';anchor.style.display='block';
      status.append(anchor);
    }
    pendingDeliveryRequest = null;

    cart = {};
    drawCart();

  } catch (error) {
    status.textContent = error.message;

  } finally {
    updateServiceButtons();
  }
};


/* ==========================================
   DINE-IN BOOKING
========================================== */

$('#dineForm').onsubmit = async event => {
  event.preventDefault();

  const status = $('#dineStatus');
  const button = event.target.querySelector(
    '[type="submit"]'
  );

  if (!backendReady || !dineEnabled) {
    status.textContent =
      'Dine-in Booking is currently closed.';
    return;
  }

  const form = new FormData(event.target);

  const name = String(
    form.get('name') || ''
  ).trim();

  const mobile = String(
    form.get('mobile') || ''
  ).trim();

  const itemId = $('#dineItem').value;
  const slot = $('#dineSlot').value;
  const date = indiaTomorrow();

  if (!name || !itemId || !slot) {
    status.textContent =
      'Complete all booking details.';
    return;
  }

  if (!/^[6-9][0-9]{9}$/.test(mobile)) {
    status.textContent =
      'Enter a valid 10-digit mobile number.';
    return;
  }

  const payload = {
    name,
    mobile,
    itemId,
    slot,
    date
  };

  const signature = JSON.stringify(payload);

  if (
    !pendingDineRequest ||
    pendingDineRequest.signature !== signature
  ) {
    pendingDineRequest = {
      signature,
      requestId: newRequestId()
    };
  }

  button.disabled = true;

  status.textContent =
    'Checking booking availability…';

  try {
    const out = await api(
      'createDineRequest',
      {
        requestId:
          pendingDineRequest.requestId,
        ...payload
      }
    );

    status.textContent =
      'Booking request ' +
      out.bookingId +
      ' created. ' +
      (
        out.message ||
        'Payment verification is required.'
      );

    pendingDineRequest = null;

  } catch (error) {
    status.textContent = error.message;

  } finally {
    updateServiceButtons();
  }
};


/* ==========================================
   INITIALIZE
========================================== */

draw();
drawCart();
updateServiceButtons();
load();
