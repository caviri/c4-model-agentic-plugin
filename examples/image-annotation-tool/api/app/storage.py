"""Object storage client (MinIO, S3-compatible)."""
import os

import boto3
from botocore.client import Config

S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "http://minio:9000")
S3_PUBLIC_ENDPOINT = os.environ.get("S3_PUBLIC_ENDPOINT", "http://localhost:9000")

BUCKET_IMAGES = os.environ.get("S3_BUCKET_IMAGES", "images")
BUCKET_THUMBNAILS = os.environ.get("S3_BUCKET_THUMBNAILS", "thumbnails")
BUCKET_EXPORTS = os.environ.get("S3_BUCKET_EXPORTS", "exports")


def _client(endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY", "minioadmin"),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY", "minioadmin"),
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )


# Uploads go over the internal network. Presigned URLs are signed against the
# public endpoint because the browser fetches the objects from MinIO directly.
_internal = _client(S3_ENDPOINT)
_public = _client(S3_PUBLIC_ENDPOINT)


def upload_image(key: str, data: bytes, content_type: str) -> None:
    _internal.put_object(Bucket=BUCKET_IMAGES, Key=key, Body=data, ContentType=content_type)


def presigned_url(bucket: str, key: str | None, expires_in: int = 3600) -> str | None:
    if key is None:
        return None
    return _public.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires_in
    )
