from types import SimpleNamespace
from uuid import uuid4

import pytest

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
async def test_send_message_without_dataset_skips_replay_lookup(monkeypatch):
    chat_session = SimpleNamespace(id=uuid4(), dataset_id=None, dataset_version_id=None, message_count=3)
    fake_service = _FakeChatService(chat_session)
    user = SimpleNamespace(user_id=str(uuid4()), role="user")
    request = chat_routes.SendMessageRequest(content="What is total sales?")

    replay_check_called = {"value": False}

    def _replay_check(*args, **kwargs):
        replay_check_called["value"] = True
        return True

    monkeypatch.setattr(chat_routes, "chat_service", fake_service)
    monkeypatch.setattr(chat_routes, "_should_attempt_replay_lookup", _replay_check)

    response = await chat_routes.send_message(
        session_id=chat_session.id,
        request=request,
        session=None,
        current_user=user,
    )

    assert replay_check_called["value"] is False
    assert "select and attach a dataset" in response.assistant_message.content.lower()
    assert response.assistant_message.output_data is None


@pytest.mark.asyncio
async def test_send_message_without_dataset_allows_simple_greeting(monkeypatch):
    chat_session = SimpleNamespace(id=uuid4(), dataset_id=None, dataset_version_id=None, message_count=1)
    fake_service = _FakeChatService(chat_session)
    user = SimpleNamespace(user_id=str(uuid4()), role="user")
    request = chat_routes.SendMessageRequest(content="Hi there")

    monkeypatch.setattr(chat_routes, "chat_service", fake_service)

    response = await chat_routes.send_message(
        session_id=chat_session.id,
        request=request,
        session=None,
        current_user=user,
    )

    assert "please attach a dataset" in response.assistant_message.content.lower()
    assert response.assistant_message.output_data is None
