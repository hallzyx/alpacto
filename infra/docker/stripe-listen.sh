#!/bin/sh
# Long-running Stripe CLI forwarder → API service on the Docker network.
set -eu

TARGET="${STRIPE_FORWARD_TO:-http://api:4000/webhooks/stripe}"

if [ -z "${STRIPE_API_KEY:-}" ]; then
  echo "STRIPE_SECRET_KEY empty — stripe listen idle (Dashboard webhooks or no Stripe)"
  exec sleep infinity
fi

if [ "${STRIPE_USE_CLI:-1}" != "1" ]; then
  echo "STRIPE_USE_CLI=0 — stripe listen disabled"
  exec sleep infinity
fi

echo "stripe listen → $TARGET"
exec stripe listen --forward-to "$TARGET"
