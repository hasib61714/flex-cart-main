/**
 * SSLCommerz payment gateway service
 * Wraps sslcommerz-lts for initiation and validation
 */
const SSLCommerzPayment = require('sslcommerz-lts');

const STORE_ID     = process.env.SSL_STORE_ID       || '';
const STORE_PASSWD = process.env.SSL_STORE_PASSWORD  || '';
const IS_LIVE      = process.env.SSL_IS_LIVE === 'true';

const BACKEND_URL  = (process.env.BACKEND_URL  || 'http://localhost:5000').replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * Initiate an SSLCommerz payment session.
 * @param {object} opts
 * @param {string} opts.tranId       - Unique transaction ID stored on the order
 * @param {number} opts.totalAmount  - Total payable in BDT
 * @param {string} opts.customerName
 * @param {string} opts.customerEmail
 * @param {string} opts.customerPhone
 * @param {string} opts.shippingAddress
 * @param {string} opts.shippingCity
 * @param {string} opts.productName  - Short description shown on SSL gateway
 * @returns {Promise<string>} GatewayPageURL to redirect the customer to
 */
async function initiatePayment({
  tranId,
  totalAmount,
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  shippingCity,
  productName,
}) {
  const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWD, IS_LIVE);

  const data = {
    total_amount:      parseFloat(totalAmount).toFixed(2),
    currency:          'BDT',
    tran_id:           tranId,
    success_url:       `${BACKEND_URL}/api/payment/success`,
    fail_url:          `${BACKEND_URL}/api/payment/fail`,
    cancel_url:        `${BACKEND_URL}/api/payment/cancel`,
    ipn_url:           `${BACKEND_URL}/api/payment/ipn`,
    shipping_method:   'Courier',
    product_name:      productName || 'FlexCart Order',
    product_category:  'General',
    product_profile:   'general',
    cus_name:          customerName  || 'Customer',
    cus_email:         customerEmail || 'customer@flexcart.com',
    cus_add1:          shippingAddress || 'Dhaka',
    cus_city:          shippingCity    || 'Dhaka',
    cus_country:       'Bangladesh',
    cus_phone:         customerPhone  || '01700000000',
    ship_name:         customerName   || 'Customer',
    ship_add1:         shippingAddress || 'Dhaka',
    ship_city:         shippingCity    || 'Dhaka',
    ship_country:      'Bangladesh',
    ship_phone:        customerPhone  || '01700000000',
  };

  const apiResponse = await sslcz.init(data);

  if (!apiResponse || apiResponse.status !== 'SUCCESS') {
    const reason = apiResponse?.failedreason || 'Unknown error from SSLCommerz';
    throw new Error(`SSLCommerz initiation failed: ${reason}`);
  }

  return apiResponse.GatewayPageURL;
}

/**
 * Validate a payment using SSLCommerz val_id.
 * @param {string} valId
 * @returns {Promise<object>} Validation response from SSLCommerz
 */
async function validatePayment(valId) {
  const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWD, IS_LIVE);
  return sslcz.validate({ val_id: valId });
}

module.exports = { initiatePayment, validatePayment, FRONTEND_URL };
