
/**
 * SONI FAST FOOD - Google Apps Script Backend
 * Version 2.1
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
  const rows = rows_(ss.getSheetByName('Settings'));

  return Object.fromEntries(
    rows.map(r => [
      String(r.key).trim(),
      String(r.value).trim()
    ])
  );
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
  return reply_({
    ok: true,
    service: 'SONI FAST FOOD API',
    version: '2.1',
    note: 'POST JSON for public requests'
  });
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

    // FIX: Accept TRUE, true, True.
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
    let itemsWritten = false;
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

      itemsWritten = true;

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
      status: 'PLACED'
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
