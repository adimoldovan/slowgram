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

# Re-upload rss.xml with the correct content-type and a SHORT cache so feed
# readers (and the proxy in front of slowgram.amoldovan.ro/rss) pick up new
# photos. Without this it inherits the long immutable cache used for photos.
if [[ -f "$SLOWGRAM_S3_SOURCE_PATH/rss.xml" ]]; then
  echo "Refreshing rss.xml content-type and cache headers"
  aws s3 cp "$SLOWGRAM_S3_SOURCE_PATH/rss.xml" "s3://$SLOW_GRAM_BUCKET_NAME/rss.xml" \
    --content-type "application/rss+xml; charset=utf-8" \
    --cache-control "public, max-age=900" \
    --metadata-directive REPLACE
fi
