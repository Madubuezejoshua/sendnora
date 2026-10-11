#!/usr/bin/env bash
# Run from your SERVER or terminal. Keep the key in an environment variable, never in browser code.
#   export SENDNARO_API_KEY=sn_test_...
#   export SENDNARO_BASE_URL=http://localhost:3000/api/v1     # optional; this is the default
set -euo pipefail

curl -sS -X POST "${SENDNARO_BASE_URL:-http://localhost:3000/api/v1}/invoices" \
  -H "Authorization: Bearer $SENDNARO_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: shop-order-1042-invoice" \
  -d '{
    "external_order_id": "order_1042",
    "document_type": "receipt",
    "payment": {"status": "paid", "reference": "merchant_payment_1042"},
    "customer": {
      "external_customer_id": "customer_42",
      "name": "Test Customer",
      "whatsapp_phone": "+2348000000000"
    },
    "currency": "NGN",
    "items": [{"description": "Sample purchase", "quantity": 1, "unit_amount_minor": 500000}],
    "channels": ["whatsapp"],
    "consent": {"whatsapp_transactional": true}
  }'
# 500000 minor units = NGN 5,000.00. The +2348000000000 number is a sandbox placeholder: do not use it in live mode.
