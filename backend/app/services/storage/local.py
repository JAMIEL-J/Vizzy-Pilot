import os
import shutil
import contextlib
from typing import Union, IO
from pathlib import Path

from .base import StorageBackend

class LocalStorageBackend(StorageBackend):
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir).resolve()
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_path(self, key: str) -> Path:
        # Prevent path traversal while handling local keys, relative paths, and prefixed database paths
        p = Path(key)
        if p.is_absolute() or p.exists():
            return p.resolve()

        # Handle keys stored in DB with leading data/uploads or uploads prefixes
        norm_key = key.replace("\\", "/")
        for prefix in [f"data/{self.base_dir.name}/", f"{self.base_dir.name}/", "data/"]:
            if norm_key.startswith(prefix):
                stripped = norm_key[len(prefix):]
                candidate = (self.base_dir / stripped).resolve()
                if candidate.exists():
                    return candidate

        path = (self.base_dir / key).resolve()
        try:
            path.relative_to(self.base_dir)
        except ValueError:
            return path
        return path

    def save(self, key: str, data: Union[bytes, IO[bytes]]) -> str:
        path = self._get_path(key)
        os.makedirs(path.parent, exist_ok=True)
        if isinstance(data, bytes):
            path.write_bytes(data)
        else:
            with open(path, "wb") as f:
                shutil.copyfileobj(data, f)
        return str(path)

    def load(self, key: str) -> bytes:
        path = self._get_path(key)
        if not path.exists():
            raise FileNotFoundError(f"Key {key} not found")
        return path.read_bytes()

    def exists(self, key: str) -> bool:
        return self._get_path(key).exists()

    def delete(self, key: str) -> None:
        path = self._get_path(key)
        if path.exists():
            path.unlink()

    def download_to_temp(self, key: str) -> str:
        path = self._get_path(key)
        os.makedirs(path.parent, exist_ok=True)
        return str(path)

    def upload_from_temp(self, key: str, temp_path: str) -> None:
        pass

    def cleanup_temp(self, temp_path: str) -> None:
        pass
