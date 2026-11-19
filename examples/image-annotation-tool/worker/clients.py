"""Shared connections for jobs: PostgreSQL and MinIO.

The worker talks to the database directly; it never calls the API.
"""
import os

import boto3
from botocore.client import Config
from sqlalchemy import create_engine

engine = create_engine(
    os.environ.get("DATABASE_URL", "postgresql+psycopg://annotation:annotation@postgres:5432/annotation"),
    pool_pre_ping=True,
)

s3 = boto3.client(
    "s3",
    endpoint_url=os.environ.get("S3_ENDPOINT", "http://minio:9000"),
    aws_access_key_id=os.environ.get("S3_ACCESS_KEY", "minioadmin"),
    aws_secret_access_key=os.environ.get("S3_SECRET_KEY", "minioadmin"),
    config=Config(signature_version="s3v4"),
    region_name="us-east-1",
)

BUCKET_IMAGES = os.environ.get("S3_BUCKET_IMAGES", "images")
BUCKET_THUMBNAILS = os.environ.get("S3_BUCKET_THUMBNAILS", "thumbnails")
BUCKET_EXPORTS = os.environ.get("S3_BUCKET_EXPORTS", "exports")
