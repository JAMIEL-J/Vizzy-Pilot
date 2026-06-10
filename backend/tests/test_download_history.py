from types import SimpleNamespace
from uuid import uuid4, UUID
import pytest
from pathlib import Path
from app.api import download_routes
from app.core.audit import get_audit_store

@pytest.fixture(autouse=True)
def clean_audit_store():
    store = get_audit_store()
    with store._lock:
        store._events.clear()

def test_download_logging_and_history(monkeypatch):
    user_id_str = str(uuid4())
    user = SimpleNamespace(user_id=user_id_str, role="user")
    
    dataset_id = uuid4()
    version_id = uuid4()
    
    mock_dataset = SimpleNamespace(id=dataset_id, name="Test Sales Data")
    mock_version = SimpleNamespace(
        id=version_id,
        dataset_id=dataset_id,
        source_reference="test_file.csv",
        version_number=2
    )
    
    # Mock services
    monkeypatch.setattr(download_routes.dataset_service, "get_dataset_by_id", lambda *args, **kwargs: mock_dataset)
    monkeypatch.setattr(download_routes.dataset_version_service, "get_version_by_id", lambda *args, **kwargs: mock_version)
    
    # Mock Path.exists to return True
    monkeypatch.setattr(Path, "exists", lambda self: True)
    
    # Mock FileResponse initialization to not fail
    monkeypatch.setattr(download_routes, "FileResponse", lambda path, filename, media_type: SimpleNamespace(path=path, filename=filename, media_type=media_type))
    
    # Call the download handler
    download_routes.download_raw_dataset(
        dataset_id=dataset_id,
        version_id=version_id,
        session=None,
        current_user=user
    )
    
    # Now call history endpoint
    history = download_routes.get_download_history(current_user=user)
    
    assert len(history) == 1
    item = history[0]
    assert item.dataset_id == str(dataset_id)
    assert item.dataset_name == "Test Sales Data"
    assert item.version_id == str(version_id)
    assert item.version_number == 2
    assert item.download_type == "raw"
    assert item.timestamp is not None


def test_user_llm_settings(monkeypatch):
    from app.api import user_routes
    from app.core.crypto import decrypt_val
    import json
    
    user_id_str = str(uuid4())
    user = SimpleNamespace(user_id=user_id_str, role="user")
    
    mock_user_obj = SimpleNamespace(
        id=UUID(user_id_str),
        email="test@helix.ai",
        name="Test User",
        llm_settings=None
    )
    
    # Mock user_services.get_user_by_id
    monkeypatch.setattr(user_routes.user_services, "get_user_by_id", lambda *args, **kwargs: mock_user_obj)
    
    # Call GET endpoint initially (no settings saved yet)
    res_get = user_routes.get_user_llm_settings(session=None, current_user=user)
    assert res_get.provider == "default"
    assert res_get.has_openai_key is False
    assert res_get.has_gemini_key is False
    assert res_get.ollama_url == "http://localhost:11434"
    assert res_get.ollama_model == "llama3"
    
    # Call PUT endpoint to save settings
    req_update = user_routes.LLMSettingUpdateRequest(
        provider="openai",
        openai_api_key="sk-testkey123",
        gemini_api_key=None,
        ollama_url="http://localhost:11434",
        ollama_model="llama3"
    )
    
    # We also mock session.add, session.commit, session.refresh
    session_mock = SimpleNamespace(
        add=lambda x: None,
        commit=lambda: None,
        refresh=lambda x: None
    )
    
    res_put = user_routes.update_user_llm_settings(
        request=req_update,
        session=session_mock,
        current_user=user
    )
    
    assert res_put.provider == "openai"
    assert res_put.has_openai_key is True
    assert res_put.has_gemini_key is False
    
    # Verify encrypted settings on user object
    assert mock_user_obj.llm_settings is not None
    saved_dict = json.loads(mock_user_obj.llm_settings)
    assert saved_dict["provider"] == "openai"
    assert saved_dict["openai_api_key"] != "sk-testkey123" # Must be encrypted!
    assert decrypt_val(saved_dict["openai_api_key"]) == "sk-testkey123" # Must decrypt back!


@pytest.mark.asyncio
async def test_llm_routing_custom(monkeypatch):
    from app.core.llm_client import LLMClient, LLMResponse, LLMProvider
    from app.core.crypto import active_llm_config, encrypt_val
    
    # 1. Test OpenAI custom routing
    openai_key_encrypted = encrypt_val("sk-mycustomkey")
    config = {
        "provider": "openai",
        "openai_api_key": openai_key_encrypted,
        "gemini_api_key": "",
        "ollama_url": "",
        "ollama_model": ""
    }
    
    active_llm_config.set(config)
    
    client = LLMClient()
    
    openai_called = {"value": False}
    async def fake_call_openai(api_key, system_prompt, user_prompt, temperature, max_tokens, response_format=None):
        openai_called["value"] = True
        assert api_key == "sk-mycustomkey"
        return LLMResponse(content="openai reply", provider=LLMProvider.GROQ_CHAT, model="gpt-4o")
        
    monkeypatch.setattr(client, "_call_custom_openai_api", fake_call_openai)
    
    res = await client.complete(system_prompt="sys", user_prompt="usr")
    assert res.content == "openai reply"
    assert openai_called["value"] is True
    
    # 2. Test Ollama custom routing
    config_ollama = {
        "provider": "ollama",
        "openai_api_key": "",
        "gemini_api_key": "",
        "ollama_url": "http://127.0.0.1:11434",
        "ollama_model": "mistral"
    }
    active_llm_config.set(config_ollama)
    
    ollama_called = {"value": False}
    async def fake_call_ollama(url, model, system_prompt, user_prompt, temperature):
        ollama_called["value"] = True
        assert url == "http://127.0.0.1:11434"
        assert model == "mistral"
        return LLMResponse(content="ollama reply", provider=LLMProvider.GROQ_CHAT, model=model)
        
    monkeypatch.setattr(client, "_call_ollama_internal", fake_call_ollama)
    
    res_ollama = await client.complete(system_prompt="sys", user_prompt="usr")
    assert res_ollama.content == "ollama reply"
    assert ollama_called["value"] is True
    
    # Reset ContextVar
    active_llm_config.set(None)


