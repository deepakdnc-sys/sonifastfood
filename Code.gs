
/**
 * SONI FAST FOOD - Google Apps Script Backend
 * Version 2.3
 *
 * Public customer API:
 *  - getPublicConfig
 *  - createDeliveryOrder
 *  - createDineRequest
 *
 * Owner-only editor functions:
 *  - setup
 *  - testServiceStatus
 *  - testPublicConfig
 *
 * No public admin API.
 * No delivery OTP.
 */

const SFF = {
  NAME: 'SONI FAST FOOD',
  TZ: 'Asia/Kolkata',

  TABS: {
    Settings: [
      'key', 'value'
    ],

    Menu: [
      'id', 'name', 'category', 'description',
      'price', 'emoji', 'active', 'stock'
    ],

    TimeSlots: [
      'slot', 'active'
    ],

    DeliveryOrders: [
      'orderId', 'requestId', 'createdAt',
      'customerName', 'mobile', 'address',
      'landmark', 'latitude', 'longitude',
      'accuracy', 'subtotal', 'deliveryCharge',
      'total', 'paymentMode', 'paymentStatus',
      'orderStatus'
    ],

    DeliveryOrderItems: [
      'orderId', 'itemId', 'name',
      'quantity', 'unitPrice', 'lineTotal'
    ],

    DineRequests: [
      'bookingId', 'requestId', 'createdAt',
      'bookingDate', 'name', 'mobile',
      'itemId', 'slot', 'amount',
      'paymentStatus', 'status'
    ],

    AuditLogs: [
      'createdAt', 'action', 'reference', 'notes'
    ]
  }
};


/* =====================================
   1. INITIAL DATABASE SETUP
===================================== */

function setup() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');

  const ss = id
    ? SpreadsheetApp.openById(id)
    : SpreadsheetApp.create('SONI FAST FOOD Database');

  if (!id) {
    props.setProperty('SHEET_ID', ss.getId());
  }

  Object.entries(SFF.TABS).forEach(([name, headers]) => {
    let sh = ss.getSheetByName(name);

    if (!sh) {
      sh = ss.insertSheet(name);
    }

    if (sh.getLastRow() === 0) {
      sh.appendRow(headers);
      sh.setFrozenRows(1);
    }
  });

  const settings = ss.getSheetByName('Settings');

  const defaults = [
    ['deliveryEnabled', 'FALSE'],
    ['dineEnabled', 'FALSE'],
    ['deliveryRadiusKm', '3'],
    ['minOrder', '149'],
    ['deliveryBaseCharge', '25'],
    ['shopLatitude', ''],
    ['shopLongitude', '']
  ];

  const existingSettings = new Set(
    rows_(settings).map(r => String(r.key).trim())
  );

  defaults.forEach(row => {
    if (!existingSettings.has(row[0])) {
      settings.appendRow(row);
    }
  });

  const menu = ss.getSheetByName('Menu');

  if (menu.getLastRow() === 1) {
    const items = [
      ['pizza', 'Veg Pizza', 'Pizza',
       'Cheesy and fresh', 199, '🍕', 'TRUE', 20],

      ['burger', 'Veg Burger', 'Burger',
       'Crispy and fresh', 89, '🍔', 'TRUE', 20],

      ['fries', 'French Fries', 'Fries',
       'Golden and crunchy', 79, '🍟', 'TRUE', 20],

      ['momo', 'Steam Momos', 'Momo',
       'With spicy chutney', 99, '🥟', 'TRUE', 20],

      ['sandwich', 'Grilled Sandwich', 'Sandwich',
       'Freshly toasted', 119, '🥪', 'TRUE', 20]
    ];

    menu.getRange(2, 1, items.length, 8)
      .setValues(items);
  }

  const slots = ss.getSheetByName('TimeSlots');

  if (slots.getLastRow() === 1) {
    slots.getRange(2, 1, 3, 2).setValues([
      ['13:00', 'TRUE'],
      ['14:00', 'TRUE'],
      ['19:00', 'TRUE']
    ]);
  }

  Logger.log('Database: ' + ss.getUrl());
  Logger.log('Setup completed successfully');
}


/* =====================================
   2. DATABASE HELPERS
===================================== */

function db_() {
  const id = PropertiesService
    .getScriptProperties()
    .getProperty('SHEET_ID');

  if (!id) {
    throw Error('Run setup() first');
  }

  return SpreadsheetApp.openById(id);
}


function rows_(sh) {
  const values = sh.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values.shift().map(String);

  return values.map(row =>
    Object.fromEntries(
      headers.map((key, index) => [
        key,
        row[index]
      ])
    )
  );
}


function settings_(ss) {
  const sh = ss.getSheetByName('Settings');
  if (!sh) throw Error('Settings sheet missing. Run setup().');
  const values = sh.getDataRange().getValues();
  const result = {};
  const duplicates = [];
  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] == null ? '' : values[i][0]).trim();
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(result, key)) duplicates.push(key);
    result[key] = String(values[i][1] == null ? '' : values[i][1]).trim();
  }
  if (duplicates.length) {
    throw Error('Duplicate Settings keys: ' + [...new Set(duplicates)].join(', ') + '. Remove duplicate rows.');
  }
  return result;
}

/* =====================================
   3. BOOLEAN SETTINGS FIX
===================================== */

function isEnabled_(value) {
  return String(value)
    .trim()
    .toUpperCase() === 'TRUE';
}


/* =====================================
   4. MENU
===================================== */

function menu_(ss) {
  return rows_(ss.getSheetByName('Menu'))
    .filter(r => isEnabled_(r.active))
    .map(r => ({
      id: String(r.id),
      name: String(r.name),
      category: String(r.category),
      description: String(r.description),
      price: Number(r.price),
      emoji: String(r.emoji),
      active: Number(r.stock) > 0,
      stock: Number(r.stock)
    }));
}


/* =====================================
   5. JSON API
===================================== */

function reply_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


function doGet(e) {
  try {
    const ss = db_();
    const s = settings_(ss);
    return reply_({
      ok: true,
      service: 'SONI FAST FOOD API',
      version: '3.0',
      databaseConnected: true,
      deliveryEnabled: isEnabled_(s.deliveryEnabled),
      dineEnabled: isEnabled_(s.dineEnabled),
      deliveryRawValue: String(s.deliveryEnabled == null ? '' : s.deliveryEnabled),
      dineRawValue: String(s.dineEnabled == null ? '' : s.dineEnabled),
      menuCount: menu_(ss).length
    });
  } catch (err) {
    return reply_({ok: false, version: '3.0', error: String(err.message || err)});
  }
}

function doPost(e) {
  try {
    if (
      !e ||
      !e.postData ||
      !e.postData.contents
    ) {
      throw Error('Missing request');
    }

    if (e.postData.contents.length > 15000) {
      throw Error('Request too large');
    }

    const x = JSON.parse(e.postData.contents);

    if (!x || typeof x !== 'object' ||
        Array.isArray(x)) {
      throw Error('Invalid request');
    }

    switch (x.action) {

      case 'getPublicConfig':
        return reply_(getPublicConfig_());

      case 'createDeliveryOrder':
        return reply_(createDelivery_(x));

      case 'createDineRequest':
        return reply_(createDine_(x));

      case 'adminLogin': return reply_(adminLogin_(x));
      case 'adminLogout': return reply_(adminLogout_(x));
      case 'adminOrders': return reply_(adminOrders_(x));
      case 'adminUpdateOrder': return reply_(adminUpdateOrder_(x));
      case 'adminReport': return reply_(adminReport_(x));
      case 'trackDeliveryOrder': return reply_(trackDeliveryOrder_(x));

      default:
        throw Error('Unknown public action');
    }

  } catch (err) {
    console.error(err);

    return reply_({
      ok: false,
      error: String(err.message || err)
    });
  }
}


/* =====================================
   6. PUBLIC CONFIG
===================================== */

function getPublicConfig_() {
  const ss = db_();
  const s = settings_(ss);

  const slots = rows_(
    ss.getSheetByName('TimeSlots')
  )
    .filter(r => isEnabled_(r.active))
    .map(r => String(r.slot));

  return {
    ok: true,
    menu: menu_(ss),
    slots: slots,

    deliveryEnabled:
      isEnabled_(s.deliveryEnabled),

    dineEnabled:
      isEnabled_(s.dineEnabled)
  };
}


/* =====================================
   7. VALIDATION
===================================== */

function required_(value, max) {
  const s = String(value == null ? '' : value).trim();

  if (!s || s.length > max) {
    throw Error('Missing or invalid required field');
  }

  return s;
}


function safeText_(value, max) {
  const s = String(value == null ? '' : value)
    .trim()
    .slice(0, max);

  // Prevent customer text from becoming
  // a Google Sheets formula.
  return /^[=+\-@\t\r]/.test(s)
    ? "'" + s
    : s;
}


function mobile_(value) {
  const s = String(value || '').trim();

  if (!/^[6-9][0-9]{9}$/.test(s)) {
    throw Error('Invalid Indian mobile number');
  }

  return s;
}


function requestId_(value) {
  const s = required_(value, 100);

  if (!/^[a-zA-Z0-9-]{16,100}$/.test(s)) {
    throw Error('Invalid request ID');
  }

  return s;
}


function idempotent_(sh, requestId) {
  return rows_(sh).find(
    r => String(r.requestId) === requestId
  );
}


function numberSetting_(s, key, fallback, min, max) {
  const raw = s[key];

  const n = raw === undefined || raw === ''
    ? fallback
    : Number(raw);

  if (!Number.isFinite(n) || n < min || n > max) {
    throw Error('Invalid setting: ' + key);
  }

  return n;
}


/* =====================================
   8. DISTANCE CALCULATION
===================================== */

function distanceKm_(lat1, lng1, lat2, lng2) {
  const rad = x => x * Math.PI / 180;

  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) *
    Math.cos(rad(lat2)) *
    Math.sin(dLng / 2) ** 2;

  return 6371 * 2 *
    Math.asin(Math.sqrt(Math.min(1, a)));
}


/* =====================================
   9. HOME DELIVERY ORDER
===================================== */

function createDelivery_(x) {
  const lock = LockService.getScriptLock();

  lock.waitLock(25000);

  try {
    const ss = db_();
    const s = settings_(ss);

    // Case-insensitive boolean setting.
    if (!isEnabled_(s.deliveryEnabled)) {
      throw Error('Home delivery is currently closed');
    }

    const sh = ss.getSheetByName('DeliveryOrders');

    const key = requestId_(x.requestId);

    const prior = idempotent_(sh, key);

    if (prior) {
      return {
        ok: true,
        orderId: String(prior.orderId),
        total: Number(prior.total),
        status: String(prior.orderStatus),
        trackingToken: trackingToken_(String(prior.orderId), key),
        existing: true
      };
    }

    const c = x.customer || {};

    const name = safeText_(
      required_(c.name, 80), 80
    );

    const mobile = mobile_(c.mobile);

    const address = safeText_(
      required_(c.address, 400), 400
    );

    const landmark = safeText_(c.landmark, 120);

    if (
      c.lat === undefined ||
      c.lat === null ||
      c.lat === '' ||
      c.lng === undefined ||
      c.lng === null ||
      c.lng === ''
    ) {
      throw Error('Valid GPS pin required');
    }

    const lat = Number(c.lat);
    const lng = Number(c.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      (lat === 0 && lng === 0)
    ) {
      throw Error('Valid GPS pin required');
    }

    if (
      !s.shopLatitude ||
      !s.shopLongitude
    ) {
      throw Error('Shop GPS is not configured');
    }

    const shopLat = Number(s.shopLatitude);
    const shopLng = Number(s.shopLongitude);

    if (
      !Number.isFinite(shopLat) ||
      !Number.isFinite(shopLng) ||
      Math.abs(shopLat) > 90 ||
      Math.abs(shopLng) > 180 ||
      (shopLat === 0 && shopLng === 0)
    ) {
      throw Error('Invalid shop GPS configuration');
    }

    const radius = numberSetting_(
      s, 'deliveryRadiusKm', 3, 0.1, 100
    );

    const km = distanceKm_(
      lat, lng, shopLat, shopLng
    );

    if (km > radius) {
      throw Error(
        'Delivery address is outside our service area'
      );
    }

    const requested = Array.isArray(x.items)
      ? x.items
      : [];

    if (
      requested.length === 0 ||
      requested.length > 30
    ) {
      throw Error('Invalid cart');
    }

    const availableMenu = menu_(ss);

    const lines = [];
    const seen = new Set();

    for (const v of requested) {
      const itemId = required_(v.id, 80);
      const quantity = Number(v.quantity);

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20 ||
        seen.has(itemId)
      ) {
        throw Error('Invalid item quantity');
      }

      seen.add(itemId);

      const item = availableMenu.find(
        m => m.id === itemId
      );

      if (
        !item ||
        !item.active ||
        item.stock < quantity
      ) {
        throw Error(
          'Item unavailable or insufficient stock: ' +
          itemId
        );
      }

      if (
        !Number.isFinite(item.price) ||
        item.price < 0
      ) {
        throw Error('Invalid menu price: ' + itemId);
      }

      lines.push({
        id: itemId,
        name: item.name,
        quantity: quantity,
        unitPrice: item.price,
        lineTotal: item.price * quantity
      });
    }

    const subtotal = lines.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    );

    const minimum = numberSetting_(
      s, 'minOrder', 149, 0, 100000
    );

    if (subtotal < minimum) {
      throw Error(
        'Minimum order amount is ₹' + minimum
      );
    }

    const charge = numberSetting_(
      s, 'deliveryBaseCharge', 25, 0, 10000
    );

    const paymentMode = String(
      x.paymentMode || ''
    );

    if (
      !['COD', 'UPI_MANUAL'].includes(paymentMode)
    ) {
      throw Error('Invalid payment mode');
    }

    const orderId =
      'SFF-D-' +
      Utilities.formatDate(
        new Date(),
        SFF.TZ,
        'yyyyMMdd'
      ) +
      '-' +
      Utilities.getUuid()
        .slice(0, 8)
        .toUpperCase();

    const now = new Date().toISOString();

    const total = subtotal + charge;

    // Prepare stock changes before writing.
    const menuSh = ss.getSheetByName('Menu');
    const menuValues = menuSh.getDataRange().getValues();

    const stockChanges = [];

    for (const item of lines) {
      const rowIndex = menuValues.findIndex(
        (row, index) =>
          index > 0 &&
          String(row[0]) === item.id
      );

      if (rowIndex < 0) {
        throw Error('Menu item missing: ' + item.id);
      }

      const oldStock = Number(
        menuValues[rowIndex][7]
      );

      if (
        !Number.isFinite(oldStock) ||
        oldStock < item.quantity
      ) {
        throw Error(
          'Insufficient stock: ' + item.id
        );
      }

      stockChanges.push({
        row: rowIndex + 1,
        oldStock: oldStock,
        newStock: oldStock - item.quantity
      });
    }

    // Keep order and item rows together under
    // a script lock to avoid concurrent orders.
    // Sheets is not a transactional database.
    const itemSh = ss.getSheetByName(
      'DeliveryOrderItems'
    );

    const orderRow = [
      orderId,
      key,
      now,
      name,
      mobile,
      address,
      landmark,
      lat,
      lng,
      Number(c.accuracy) || '',
      subtotal,
      charge,
      total,
      paymentMode,
      paymentMode === 'COD'
        ? 'UNPAID'
        : 'PENDING_VERIFICATION',
      'PLACED'
    ];

    let orderWritten = false;
    const changedStocks = [];

    try {
      sh.appendRow(orderRow);
      orderWritten = true;

      const itemRows = lines.map(item => [
        orderId,
        item.id,
        item.name,
        item.quantity,
        item.unitPrice,
        item.lineTotal
      ]);

      const itemStart = itemSh.getLastRow() + 1;

      itemSh.getRange(
        itemStart,
        1,
        itemRows.length,
        6
      ).setValues(itemRows);


      for (const change of stockChanges) {
        menuSh.getRange(
          change.row, 8
        ).setValue(change.newStock);

        changedStocks.push(change);
      }

      SpreadsheetApp.flush();

    } catch (writeError) {
      // Best-effort recovery. This does not
      // guarantee atomic rollback if Apps Script
      // terminates or Sheets writes partially fail.
      console.error(
        'Order write failed: ' + writeError
      );

      let rollbackOk = true;

      try {
        for (const change of changedStocks) {
          menuSh.getRange(
            change.row, 8
          ).setValue(change.oldStock);
        }

        const itemData = itemSh.getDataRange()
          .getValues();

        for (let r = itemData.length - 1; r >= 1; r--) {
          if (String(itemData[r][0]) === orderId) {
            itemSh.deleteRow(r + 1);
          }
        }

        if (orderWritten) {
          const orderData = sh.getDataRange()
            .getValues();

          for (
            let r = orderData.length - 1;
            r >= 1;
            r--
          ) {
            if (String(orderData[r][0]) === orderId) {
              sh.deleteRow(r + 1);
            }
          }
        }

        SpreadsheetApp.flush();

      } catch (rollbackError) {
        rollbackOk = false;
        console.error(
          'ROLLBACK FAILED for ' + orderId +
          ': ' + rollbackError
        );
      }

      if (!rollbackOk) {
        throw Error(
          'Order processing uncertain. Contact shop ' +
          'before trying again. Reference: ' + orderId
        );
      }

      throw Error(
        'Order could not be saved. Please try again.'
      );
    }

    try {
      ss.getSheetByName('AuditLogs').appendRow([
        now,
        'ORDER_CREATED',
        orderId,
        'Public delivery order'
      ]);
    } catch (auditError) {
      console.error('Audit log failed: ' + auditError);
    }

    return {
      ok: true,
      orderId: orderId,
      total: total,
      status: 'PLACED',
      trackingToken: trackingToken_(orderId, key)
    };

  } finally {
    lock.releaseLock();
  }
}


/* =====================================
   10. TOMORROW DATE
===================================== */

function tomorrow_() {
  const today = Utilities.formatDate(
    new Date(),
    SFF.TZ,
    'yyyy-MM-dd'
  );

  const p = today.split('-').map(Number);

  return Utilities.formatDate(
    new Date(
      Date.UTC(p[0], p[1] - 1, p[2] + 1)
    ),
    'UTC',
    'yyyy-MM-dd'
  );
}


/* =====================================
   11. DINE-IN BOOKING REQUEST
===================================== */

function createDine_(x) {
  const lock = LockService.getScriptLock();

  lock.waitLock(25000);

  try {
    const ss = db_();
    const s = settings_(ss);

    // FIX: Accept TRUE, true, True.
    if (!isEnabled_(s.dineEnabled)) {
      throw Error('Dine-in booking is currently closed');
    }

    const sh = ss.getSheetByName('DineRequests');

    const key = requestId_(x.requestId);

    const prior = idempotent_(sh, key);

    if (prior) {
      return {
        ok: true,
        bookingId: String(prior.bookingId),
        message: 'Existing pending request'
      };
    }

    const name = safeText_(
      required_(x.name, 80), 80
    );

    const mobile = mobile_(x.mobile);
    const itemId = required_(x.itemId, 80);
    const slot = required_(x.slot, 30);
    const date = required_(x.date, 10);

    if (date !== tomorrow_()) {
      throw Error(
        'Only tomorrow bookings are allowed'
      );
    }

    const validSlot = rows_(
      ss.getSheetByName('TimeSlots')
    ).some(r =>
      String(r.slot) === slot &&
      isEnabled_(r.active)
    );

    if (!validSlot) {
      throw Error('Invalid time slot');
    }

    const item = menu_(ss).find(
      i => i.id === itemId && i.active
    );

    if (!item) {
      throw Error('Item unavailable');
    }

    const duplicate = rows_(sh).some(r =>
      String(r.mobile) === mobile &&
      !['REJECTED', 'CANCELLED'].includes(
        String(r.status).toUpperCase()
      )
    );

    if (duplicate) {
      throw Error(
        'Mobile already has a booking request'
      );
    }

    const bookingId =
      'SFF-B-' +
      Utilities.getUuid()
        .slice(0, 10)
        .toUpperCase();

    const now = new Date().toISOString();

    sh.appendRow([
      bookingId,
      key,
      now,
      date,
      name,
      mobile,
      itemId,
      slot,
      item.price,
      'PENDING_VERIFICATION',
      'AWAITING_PAYMENT'
    ]);

    try {
      ss.getSheetByName('AuditLogs').appendRow([
        now,
        'DINE_REQUEST_CREATED',
        bookingId,
        'Public dine-in request'
      ]);
    } catch (err) {
      console.error('Audit log failed: ' + err);
    }

    return {
      ok: true,
      bookingId: bookingId,
      message:
        'Request received. Booking is not approved ' +
        'until payment verification and owner approval.'
    };

  } finally {
    lock.releaseLock();
  }
}


/* =====================================
   12. OWNER TEST FUNCTIONS
   Run only inside Apps Script Editor
===================================== */

function testServiceStatus() {
  const ss = db_();
  const s = settings_(ss);

  Logger.log('Database: ' + ss.getUrl());

  Logger.log(
    'Home Delivery: ' +
    (isEnabled_(s.deliveryEnabled)
      ? 'OPEN'
      : 'CLOSED')
  );

  Logger.log(
    'Dine-in Booking: ' +
    (isEnabled_(s.dineEnabled)
      ? 'OPEN'
      : 'CLOSED')
  );

  Logger.log(
    'Delivery Raw Value: ' +
    JSON.stringify(s.deliveryEnabled)
  );

  Logger.log(
    'Dine Raw Value: ' +
    JSON.stringify(s.dineEnabled)
  );

  Logger.log(
    'Shop GPS: ' +
    s.shopLatitude + ', ' +
    s.shopLongitude
  );
}


function testPublicConfig() {
  Logger.log(
    JSON.stringify(
      getPublicConfig_(),
      null,
      2
    )
  );
}


/** Run from Apps Script editor, not exposed as a public action. */
function diagnoseDelivery() {
  const ss = db_();
  const s = settings_(ss);
  const result = {
    version: '3.0',
    databaseUrl: ss.getUrl(),
    deliveryRawValue: s.deliveryEnabled,
    deliveryEnabled: isEnabled_(s.deliveryEnabled),
    dineRawValue: s.dineEnabled,
    dineEnabled: isEnabled_(s.dineEnabled),
    shopGpsConfigured: Boolean(s.shopLatitude && s.shopLongitude),
    menuCount: menu_(ss).length
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/* =====================================
   13. OWNER ADMIN - SECURE SERVER API
   Set OWNER_SETUP_PASSWORD in Script Properties,
   then run initializeOwnerPassword() in editor.
   Remove the property automatically after setup.
===================================== */

function hex_(bytes) {
  return bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function digest_(text) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text));
}
function constantEqual_(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length,b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function passwordHash_(password, salt) {
  // Iterated salted SHA-256; use a strong, unique 16+ character password.
  // Apps Script lacks a built-in password KDF; this is a pragmatic
  // small-shop implementation, not a substitute for managed identity.
  let h = salt + ':' + password;
  for (let i = 0; i < 12000; i++) h = digest_(h + ':' + salt);
  return h;
}
function initializeOwnerPassword() {
  const p = PropertiesService.getScriptProperties();
  const password = p.getProperty('OWNER_SETUP_PASSWORD');
  if (!password || password.length < 16) throw Error('Set OWNER_SETUP_PASSWORD to 16+ characters in Script Properties first.');
  if (p.getProperty('OWNER_PASSWORD_HASH')) throw Error('Password already configured. Run rotateOwnerPassword() for changes.');
  const salt = Utilities.getUuid() + Utilities.getUuid();
  p.setProperties({OWNER_PASSWORD_SALT:salt, OWNER_PASSWORD_HASH:passwordHash_(password,salt)});
  p.deleteProperty('OWNER_SETUP_PASSWORD');
  Logger.log('Owner password initialized. No password printed.');
}
function rotateOwnerPassword() {
  const p = PropertiesService.getScriptProperties();
  const password = p.getProperty('OWNER_SETUP_PASSWORD');
  if (!password || password.length < 16) throw Error('Set a new 16+ character OWNER_SETUP_PASSWORD first.');
  const salt = Utilities.getUuid() + Utilities.getUuid();
  p.setProperties({OWNER_PASSWORD_SALT:salt, OWNER_PASSWORD_HASH:passwordHash_(password,salt)});
  p.deleteProperty('OWNER_SETUP_PASSWORD');
  // Old sessions remain valid for at most their cache lifetime; revoke
  // sessions immediately by changing the session generation.
  p.setProperty('OWNER_SESSION_GENERATION', Utilities.getUuid());
  Logger.log('Owner password rotated and prior sessions revoked.');
}
function adminLogin_(x) {
  const p = PropertiesService.getScriptProperties();
  const salt = p.getProperty('OWNER_PASSWORD_SALT');
  const expected = p.getProperty('OWNER_PASSWORD_HASH');
  if (!salt || !expected) throw Error('Owner password is not initialized.');
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const attempts = Number(cache.get('owner_login_failures') || 0);
    if (attempts >= 5) throw Error('Too many login attempts. Try again in 15 minutes.');
    const supplied = String(x.password || '');
    if (supplied.length > 256 || !constantEqual_(passwordHash_(supplied,salt),expected)) {
      cache.put('owner_login_failures',String(attempts+1),900);
      throw Error('Incorrect owner password');
    }
    cache.remove('owner_login_failures');
    const token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
    const generation = p.getProperty('OWNER_SESSION_GENERATION') || 'initial';
    cache.put('owner_session_' + digest_(token), generation, 21600);
    return {ok:true,token,expiresInSeconds:21600};
  } finally {lock.releaseLock();}
}
function requireOwner_(x) {
  const token = String(x.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Owner login required');
  const actual = CacheService.getScriptCache().get('owner_session_' + digest_(token));
  const generation = PropertiesService.getScriptProperties().getProperty('OWNER_SESSION_GENERATION') || 'initial';
  if (!actual || !constantEqual_(actual,generation)) throw Error('Session expired. Please log in again.');
}
function adminLogout_(x) {
  requireOwner_(x);
  CacheService.getScriptCache().remove('owner_session_' + digest_(String(x.token)));
  return {ok:true};
}
function adminOrders_(x) {
  requireOwner_(x);
  const ss=db_();
  const all=rows_(ss.getSheetByName('DeliveryOrders'));
  const itemRows=rows_(ss.getSheetByName('DeliveryOrderItems'));
  const filter=String(x.status||'ALL').toUpperCase();
  const result=all.filter(r=>filter==='ALL'||String(r.orderStatus).toUpperCase()===filter)
    .slice(-200).reverse().map(r=>({
      orderId:String(r.orderId),createdAt:String(r.createdAt),customerName:String(r.customerName),
      mobile:String(r.mobile),address:String(r.address),landmark:String(r.landmark),
      latitude:Number(r.latitude),longitude:Number(r.longitude),subtotal:Number(r.subtotal),
      deliveryCharge:Number(r.deliveryCharge),total:Number(r.total),paymentMode:String(r.paymentMode),
      paymentStatus:String(r.paymentStatus),orderStatus:String(r.orderStatus).toUpperCase()==='ACCEPT'?'ACCEPTED':String(r.orderStatus),
      items:itemRows.filter(i=>String(i.orderId)===String(r.orderId)).map(i=>({name:String(i.name),quantity:Number(i.quantity),lineTotal:Number(i.lineTotal)}))
    }));
  return {ok:true,orders:result};
}
function adminUpdateOrder_(x) {
  requireOwner_(x);
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try {
    const ss=db_(),sh=ss.getSheetByName('DeliveryOrders');
    const orderId=required_(x.orderId,100);
    const data=sh.getDataRange().getValues();
    const idx=data.findIndex((r,i)=>i>0&&String(r[0])===orderId);
    if(idx<0)throw Error('Order not found');
    const row=idx+1, current=String(data[idx][15]).toUpperCase()==='ACCEPT'?'ACCEPTED':String(data[idx][15]).toUpperCase();
    const action=String(x.operation||'').toUpperCase();
    const transitions={ACCEPT:['PLACED'],PREPARING:['ACCEPTED'],OUT_FOR_DELIVERY:['PREPARING'],DELIVERED:['OUT_FOR_DELIVERY'],REJECTED:['PLACED','ACCEPTED']};
    const paymentActions=['MARK_PAID','MARK_UNPAID'];
    if (!transitions[action]&&!paymentActions.includes(action))throw Error('Invalid owner operation');
    if (transitions[action]&&!transitions[action].includes(current))throw Error('Cannot change '+current+' to '+action);
    const now=new Date().toISOString();
    if(action==='REJECTED') {
      // Restore stock before marking rejected, under the same lock.
      // Check item and stock rows first; partial Sheets failures require reconciliation.
      const itemRows=rows_(ss.getSheetByName('DeliveryOrderItems')).filter(r=>String(r.orderId)===orderId);
      const totals={};
      itemRows.forEach(i=>totals[String(i.itemId)]=(totals[String(i.itemId)]||0)+Number(i.quantity));
      const menuSh=ss.getSheetByName('Menu'),menuValues=menuSh.getDataRange().getValues();
      const changes=Object.entries(totals).map(([id,qty])=>{
        const m=menuValues.findIndex((r,i)=>i>0&&String(r[0])===id);
        if(m<0||!Number.isFinite(qty)||qty<=0)throw Error('Cannot restore missing item: '+id);
        return {row:m+1,old:Number(menuValues[m][7]),qty};
      });
      for(const c of changes)menuSh.getRange(c.row,8).setValue(c.old+c.qty);
    }
    if (transitions[action]) sh.getRange(row,16).setValue(action === 'ACCEPT' ? 'ACCEPTED' : action);
    if (paymentActions.includes(action)) {
      if(current==='REJECTED')throw Error('Cannot update payment for rejected order');
      const mode=String(data[idx][13]);
      const desired=action==='MARK_PAID'?'PAID':(mode==='COD'?'UNPAID':'PENDING_VERIFICATION');
      sh.getRange(row,15).setValue(desired);
    }
    SpreadsheetApp.flush();
    try{ss.getSheetByName('AuditLogs').appendRow([now,'OWNER_'+action,orderId,'Owner dashboard']);}catch(err){console.error(err);}
    return {ok:true,orderId,orderStatus:transitions[action]?(action === 'ACCEPT' ? 'ACCEPTED' : action):current};
  } finally {lock.releaseLock();}
}
function adminReport_(x) {
  requireOwner_(x);
  const ss=db_(),all=rows_(ss.getSheetByName('DeliveryOrders'));
  const from=String(x.from||'').trim(),to=String(x.to||'').trim();
  if(from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))throw Error('Invalid from date');
  if(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))throw Error('Invalid to date');
  const filtered=all.filter(r=>{
    const date=Utilities.formatDate(new Date(r.createdAt),SFF.TZ,'yyyy-MM-dd');
    return (!from||date>=from)&&(!to||date<=to);
  });
  const delivered=filtered.filter(r=>String(r.orderStatus)==='DELIVERED');
  const paid=filtered.filter(r=>String(r.paymentStatus)==='PAID');
  const realized=filtered.filter(r=>String(r.orderStatus)==='DELIVERED'&&String(r.paymentStatus)==='PAID');
  const total=rows=>rows.reduce((sum,r)=>sum+Number(r.total||0),0);
  const statuses={};filtered.forEach(r=>{const k=String(r.orderStatus);statuses[k]=(statuses[k]||0)+1;});
  return {ok:true,report:{orders:filtered.length,delivered:delivered.length,rejected:statuses.REJECTED||0,
    placedValue:total(filtered),deliveredValue:total(delivered),paymentsMarkedPaid:total(paid),
    realizedSales:total(realized),unpaidDelivered:delivered.filter(r=>String(r.paymentStatus)!=='PAID').length,
    byStatus:statuses,from,to,
    codOrders:filtered.filter(r=>String(r.paymentMode)==='COD').length,
    upiOrders:filtered.filter(r=>String(r.paymentMode)==='UPI_MANUAL').length,
    codPaid:total(filtered.filter(r=>String(r.paymentMode)==='COD'&&String(r.paymentStatus)==='PAID')),
    upiPaid:total(filtered.filter(r=>String(r.paymentMode)==='UPI_MANUAL'&&String(r.paymentStatus)==='PAID')),
    pendingPayments:filtered.filter(r=>String(r.paymentStatus)!=='PAID'&&String(r.orderStatus)!=='REJECTED').length,
    rows:filtered.slice(-2000).map(r=>({orderId:String(r.orderId),date:Utilities.formatDate(new Date(r.createdAt),SFF.TZ,'yyyy-MM-dd'),status:String(r.orderStatus),paymentMode:String(r.paymentMode),paymentStatus:String(r.paymentStatus),total:Number(r.total)}))}};
}

/* v3.2: private tracking capability, never exposes address or phone. */
function initializeTrackingSecret() {
  const p=PropertiesService.getScriptProperties();
  if(!p.getProperty('SFF_TRACKING_SECRET'))
    p.setProperty('SFF_TRACKING_SECRET',Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid());
  Logger.log('Tracking secret ready.');
}
function trackingSecret_() {
  const secret=PropertiesService.getScriptProperties().getProperty('SFF_TRACKING_SECRET');
  if(!secret)throw Error('Run initializeTrackingSecret() in Apps Script editor before accepting orders.');
  return secret;
}
function trackingToken_(orderId,requestId){
  const raw=Utilities.computeHmacSha256Signature(orderId+'|'+requestId,trackingSecret_());
  return hex_(raw);
}
function trackDeliveryOrder_(x){
  const id=String(x.orderId||'').trim(),token=String(x.trackingToken||'').trim();
  if(!/^SFF-D-[0-9]{8}-[A-Z0-9]{8}$/.test(id)||!/^[0-9a-f]{64}$/.test(token))throw Error('Invalid tracking details');
  const orders=rows_(db_().getSheetByName('DeliveryOrders'));
  const r=orders.find(o=>String(o.orderId)===id);
  if(!r||!constantEqual_(trackingToken_(id,String(r.requestId)),token))throw Error('Order not found or tracking link invalid');
  const status=String(r.orderStatus).toUpperCase()==='ACCEPT'?'ACCEPTED':String(r.orderStatus).toUpperCase();
  return {ok:true,orderId:id,status,paymentStatus:String(r.paymentStatus),paymentMode:String(r.paymentMode),total:Number(r.total)};
}
