#!/usr/bin/env bash

if [[ -z "$SLOW_GRAM_BUCKET_NAME" ]]; then
  echo "::error::'SLOW_GRAM_BUCKET_NAME' is not defined"
  exit 1
fi

if [[ -z "$SLOWGRAM_S3_SOURCE_PATH" ]]; then
  echo "::error::'SLOWGRAM_S3_SOURCE_PATH' is not defined"
  exit 1
fi

echo "Syncing with S3 bucket"
aws s3 sync "$SLOWGRAM_S3_SOURCE_PATH" "s3://$SLOW_GRAM_BUCKET_NAME" --delete --size-only
