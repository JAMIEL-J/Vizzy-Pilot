from typing import Union, IO
import abc
import contextlib
import os

class StorageBackend(abc.ABC):
    @abc.abstractmethod
    def save(self, key: str, data: Union[bytes, IO[bytes]]) -> str:
        """Save data to storage and return the resolved key/path."""
        pass

    @abc.abstractmethod
    def load(self, key: str) -> bytes:
        """Load data from storage as bytes."""
        pass

    @abc.abstractmethod
    def exists(self, key: str) -> bool:
        """Check if key exists in storage."""
        pass

    @abc.abstractmethod
    def delete(self, key: str) -> None:
        """Delete key from storage."""
        pass

    @abc.abstractmethod
    def download_to_temp(self, key: str) -> str:
        """Download key to a local temp file and return the path. For local backend, just return the path."""
        pass

    @abc.abstractmethod
    def upload_from_temp(self, key: str, temp_path: str) -> None:
        """Upload a local temp file to the key. For local backend, do nothing."""
        pass

    @abc.abstractmethod
    def cleanup_temp(self, temp_path: str) -> None:
        """Clean up the temp file if it exists. For local backend, do nothing."""
        pass
