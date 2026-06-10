import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4
from types import SimpleNamespace

from app.api import chat_routes

class _FakeChatService:
    def __init__(self, chat_session):
        self.chat_session = chat_session
        self.assistant_messages = []

    def get_chat_session(self, session, session_id, user_id):
        return self.chat_session

    def add_user_message(self, session, session_id, user_id, content):
        return SimpleNamespace(
            id=uuid4(),
            role="user",
            content=content,
            output_data=None,
            intent_type=None,
            sequence=1,
        )

    def auto_generate_title(self, session, session_id, first_message):
        return None

    def add_assistant_message(self, session, session_id, content, output_data=None, intent_type=None):
        msg = SimpleNamespace(
            id=uuid4(),
            role="assistant",
            content=content,
            output_data=output_data,
            intent_type=intent_type,
            sequence=2,
        )
        self.assistant_messages.append(msg)
        return msg


@pytest.mark.asyncio
async def test_get_initial_suggestions_no_dataset(monkeypatch):
    chat_session = SimpleNamespace(id=uuid4(), dataset_version_id=None, message_count=1)
    fake_service = _FakeChatService(chat_session)
    user = SimpleNamespace(user_id=str(uuid4()), role="user")

    monkeypatch.setattr(chat_routes, "chat_service", fake_service)

    response = await chat_routes.get_initial_suggestions(
        session_id=chat_session.id,
        session=None,
        current_user=user
    )

    assert "suggestions" in response
    assert len(response["suggestions"]) == 2
    assert "revenue" in response["suggestions"][0].lower() or "compare" in response["suggestions"][1].lower()


@pytest.mark.asyncio
async def test_get_initial_suggestions_with_dataset(monkeypatch):
    chat_session = SimpleNamespace(id=uuid4(), dataset_version_id=uuid4(), message_count=1)
    fake_service = _FakeChatService(chat_session)
    user = SimpleNamespace(user_id=str(uuid4()), role="user")

    # Mock contract lookup to return None (triggering fallback or simple generate call)
    mock_exec = MagicMock()
    mock_exec.first.return_value = None
    mock_session = MagicMock()
    mock_session.exec.return_value = mock_exec

    # Mock suggestion generator
    mock_generate = AsyncMock(return_value=["Break down region", "Total profit"])

    monkeypatch.setattr(chat_routes, "chat_service", fake_service)
    monkeypatch.setattr(
        "app.services.llm.suggestion_generator.generate_contextual_suggestions",
        mock_generate
    )

    response = await chat_routes.get_initial_suggestions(
        session_id=chat_session.id,
        session=mock_session,
        current_user=user
    )

    assert "suggestions" in response
    assert response["suggestions"] == ["Break down region", "Total profit"]


@pytest.mark.asyncio
async def test_send_message_stream_endpoint(monkeypatch):
    chat_session = SimpleNamespace(id=uuid4(), dataset_version_id=None, message_count=1)
    fake_service = _FakeChatService(chat_session)
    user = SimpleNamespace(user_id=str(uuid4()), role="user")
    request = chat_routes.SendMessageRequest(content="Hi there", force_deep_analysis=False)

    monkeypatch.setattr(chat_routes, "chat_service", fake_service)

    response = await chat_routes.send_message_stream(
        session_id=chat_session.id,
        request=request,
        session=None,
        current_user=user
    )

    from fastapi.responses import StreamingResponse
    assert isinstance(response, StreamingResponse)
    
    # Read the generator output
    body = []
    async for chunk in response.body_iterator:
        body.append(chunk)
        
    full_body = "".join(body)
    assert "complete" in full_body
