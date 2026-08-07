#!/bin/sh
# First-boot DB seed + wallets (no-op when demo data already exists).
set -eu
cd /app
export BOOTSTRAP_CWD=/app
exec yarn workspace @alpacto/database bootstrap:first-boot
