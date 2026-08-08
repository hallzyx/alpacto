#!/bin/sh
# Create evidence bucket (CORS is configured on the minio service via MINIO_API_CORS_ALLOW_ORIGIN).
set -eu

ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
ACCESS="${S3_ACCESS_KEY:-alpacto}"
SECRET="${S3_SECRET_KEY:-alpacto123}"
BUCKET="${S3_BUCKET:-alpacto-evidence}"

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
echo "MinIO bucket ${BUCKET} ready"
exit 0
