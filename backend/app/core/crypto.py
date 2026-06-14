import base64
import hashlib
import os
from typing import Optional
from cryptography.fernet import Fernet
from app.core.config import get_settings

_fernet_instance: Optional[Fernet] = None

def get_secret_key() -> str:
    settings = get_settings()
    if settings.auth.secret_key:
        return settings.auth.secret_key.get_secret_value()
    
    # Dev fallback — test context only
    if os.getenv("TESTING") == "1":
        return "test-secret-key-not-for-production"
    
    raise RuntimeError(
        "AUTH_SECRET_KEY is required. "
        "Set it in your environment before starting the application."
    )

def _get_fernet() -> Fernet:
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance

    encryption_key = os.getenv("ENCRYPTION_KEY")
    if not encryption_key:
        secret_key = get_secret_key()
        key_hash = hashlib.sha256(secret_key.encode()).digest()
        encryption_key = base64.urlsafe_b64encode(key_hash).decode()
        
    try:
        _fernet_instance = Fernet(encryption_key.encode())
    except Exception as e:
        # If the key is not urlsafe base64, hash it to make it compatible
        key_hash = hashlib.sha256(encryption_key.encode()).digest()
        derived_key = base64.urlsafe_b64encode(key_hash).decode()
        _fernet_instance = Fernet(derived_key.encode())
        
    return _fernet_instance

def encrypt_val(val: str) -> str:
    """Encrypt a string value using Fernet symmetric encryption."""
    if not val:
        return ""
    f = _get_fernet()
    return f.encrypt(val.encode()).decode()

def decrypt_val(val: str) -> str:
    """Decrypt a Fernet encrypted cipher text back to plain text."""
    if not val:
        return ""
    f = _get_fernet()
    try:
        return f.decrypt(val.encode()).decode()
    except Exception:
        # Return empty or original value if decryption fails (e.g. invalid key/format)
        return ""

import contextvars
from typing import Dict, Any

active_llm_config: contextvars.ContextVar[Optional[Dict[str, Any]]] = contextvars.ContextVar(
    "active_llm_config", default=None
)

