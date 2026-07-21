import os
import contextlib
import tempfile
import uuid
import logging
from typing import Union, IO

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None
    ClientError = Exception

from .base import StorageBackend

logger = logging.getLogger(__name__)

class S3StorageBackend(StorageBackend):
    def __init__(self, bucket: str, endpoint_url: str = None, region: str = None):
        if boto3 is None:
            raise ImportError("boto3 is required for S3StorageBackend. Run `pip install boto3`.")
        self.bucket = bucket
        # Using boto3 standard credentials loading (env vars AWS_ACCESS_KEY_ID, etc.)
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region
        )

    def save(self, key: str, data: Union[bytes, IO[bytes]]) -> str:
        try:
            if isinstance(data, bytes):
                self.client.put_object(Bucket=self.bucket, Key=key, Body=data)
            else:
                self.client.upload_fileobj(data, self.bucket, key)
            return f"s3://{self.bucket}/{key}"
        except ClientError as e:
            logger.error(f"Failed to upload to S3: {e}")
            raise RuntimeError("Storage upload failed")

    def load(self, key: str) -> bytes:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return response['Body'].read()
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                raise FileNotFoundError(f"Key {key} not found")
            logger.error(f"Failed to load from S3: {e}")
            raise RuntimeError("Storage read failed")

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            logger.error(f"Failed to check existence in S3: {e}")
            return False

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except ClientError as e:
            logger.error(f"Failed to delete from S3: {e}")
            raise RuntimeError("Storage delete failed")

    def download_to_temp(self, key: str) -> str:
        tmp_path = os.path.join(tempfile.gettempdir(), f"duckdb_{uuid.uuid4().hex}_{os.path.basename(key)}")
        if self.exists(key):
            try:
                self.client.download_file(self.bucket, key, tmp_path)
            except ClientError as e:
                logger.error(f"Failed to download duckdb file from S3: {e}")
                raise RuntimeError("Storage download failed")
        return tmp_path

    def upload_from_temp(self, key: str, temp_path: str) -> None:
        if os.path.exists(temp_path):
            try:
                self.client.upload_file(temp_path, self.bucket, key)
            except ClientError as e:
                logger.error(f"Failed to upload duckdb file to S3: {e}")
                raise RuntimeError("Storage upload failed")

    def cleanup_temp(self, temp_path: str) -> None:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
