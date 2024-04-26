#!/usr/bin/env bash

if [[ -z "$BUCKET_NAME" ]]; then
  echo "::error::'BUCKET_NAME' is not defined"
  exit 1
fi

if [[ -z "$SOURCE_PATH" ]]; then
  echo "::error::'SOURCE_PATH' is not defined"
  exit 1
fi

aws s3 sync "$SOURCE_PATH" "s3://$BUCKET_NAME" --delete
