#!/bin/sh
# Create evidence bucket + browser CORS for presigned PUT (inspector uploads).
set -eu

ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
ACCESS="${S3_ACCESS_KEY:-alpacto}"
SECRET="${S3_SECRET_KEY:-alpacto123}"
BUCKET="${S3_BUCKET:-alpacto-evidence}"

# Comma-separated origins (browser hosts that call the MinIO public URL).
# Defaults: APP_URL + localhost for local docker.
ORIGINS_RAW="${S3_CORS_ORIGINS:-}"
if [ -z "$ORIGINS_RAW" ]; then
  ORIGINS_RAW="${APP_URL:-http://localhost:3000},http://localhost:3000"
fi

echo "Waiting for MinIO at ${ENDPOINT}..."
i=0
until mc alias set local "$ENDPOINT" "$ACCESS" "$SECRET" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "ERROR: MinIO not ready after 60s"
    exit 1
  fi
  sleep 1
done

mc mb --ignore-existing "local/${BUCKET}"

# Build CORS JSON from comma-separated origins (trim spaces, skip empties).
cors_file="$(mktemp)"
{
  printf '%s\n' '{'
  printf '%s\n' '  "CORSRules": ['
  printf '%s\n' '    {'
  printf '%s\n' '      "AllowedOrigins": ['
  first=1
  OLD_IFS=$IFS
  IFS=,
  for origin in $ORIGINS_RAW; do
    origin=$(printf '%s' "$origin" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    [ -n "$origin" ] || continue
    if [ "$first" -eq 1 ]; then
      first=0
    else
      printf ',\n'
    fi
    printf '        "%s"' "$origin"
  done
  IFS=$OLD_IFS
  printf '\n'
  printf '%s\n' '      ],'
  printf '%s\n' '      "AllowedMethods": ["GET", "PUT", "POST", "HEAD", "DELETE"],'
  printf '%s\n' '      "AllowedHeaders": ["*"],'
  printf '%s\n' '      "ExposeHeaders": ["ETag", "x-amz-request-id", "x-amz-id-2"],'
  printf '%s\n' '      "MaxAgeSeconds": 3600'
  printf '%s\n' '    }'
  printf '%s\n' '  ]'
  printf '%s\n' '}'
} >"$cors_file"

echo "Applying CORS origins: ${ORIGINS_RAW}"
mc cors set "local/${BUCKET}" "$cors_file"
mc cors info "local/${BUCKET}" || true
rm -f "$cors_file"
echo "MinIO bucket ${BUCKET} ready"
exit 0
