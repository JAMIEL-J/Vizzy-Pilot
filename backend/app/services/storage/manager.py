from app.core.config import get_settings
from .base import StorageBackend

_storage_instance = None

def get_storage() -> StorageBackend:
    global _storage_instance
    if _storage_instance is None:
        settings = get_settings()
        if settings.storage.backend == "s3":
            if not settings.storage.s3_bucket:
                raise ValueError("S3 bucket must be configured when backend is s3")
            from .s3 import S3StorageBackend
            _storage_instance = S3StorageBackend(
                bucket=settings.storage.s3_bucket,
                endpoint_url=settings.storage.s3_endpoint_url,
                region=settings.storage.s3_region
            )
        else:
            from .local import LocalStorageBackend
            _storage_instance = LocalStorageBackend(base_dir=settings.storage.data_dir)
            
    return _storage_instance
