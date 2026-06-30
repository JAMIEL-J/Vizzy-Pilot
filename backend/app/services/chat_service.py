"""
Chat service module.

Belongs to: services layer
Responsibility: Chat session and message management
Restrictions: Uses models and core utilities only
"""

from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlmodel import Session, select, col

from app.models.chat_session import ChatSession
from app.models.chat_message import ChatMessage, MessageRole
from app.core.exceptions import ResourceNotFound, AuthorizationError, InvalidOperation
from app.core.audit import record_audit_event
from app.core.logger import get_logger
from app.services.dataset_version_service import get_latest_version


logger = get_logger(__name__)


# =============================================================================
# Session Management
# =============================================================================


def create_chat_session(
    session: Session,
    user_id: UUID,
    dataset_id: Optional[UUID] = None,
    dataset_version_id: Optional[UUID] = None,
    title: Optional[str] = None,
) -> ChatSession:
    """
    Create a new chat session.
    
    Sessions can be general or tied to a specific dataset.
    If dataset_id is provided without dataset_version_id, automatically
    fetches the latest version of that dataset.
    """
    # Auto-resolve dataset_version_id if dataset_id is provided
    if dataset_id and not dataset_version_id:
        try:
            latest_version = get_latest_version(
                session=session,
                dataset_id=dataset_id,
            )
            dataset_version_id = latest_version.id
            logger.info(f"Auto-resolved dataset {dataset_id} to version {dataset_version_id}")
        except ResourceNotFound:
            logger.warning(f"No active versions found for dataset {dataset_id}")
            # Continue without version - chat will work but without dataset context
    elif dataset_id and dataset_version_id:
        logger.info(f"Creating chat session for dataset {dataset_id} using explicit version {dataset_version_id}")
    
    chat_session = ChatSession(
        user_id=user_id,
        dataset_id=dataset_id,
        dataset_version_id=dataset_version_id,
        title=title or "New Conversation",
        is_active=True,
        message_count=0,
    )

    session.add(chat_session)
    session.commit()
    session.refresh(chat_session)

    record_audit_event(
        event_type="CHAT_SESSION_CREATED",
        user_id=str(user_id),
        resource_type="ChatSession",
        resource_id=str(chat_session.id),
    )

    logger.info(f"Created chat session {chat_session.id} for user {user_id}")
    return chat_session


def get_chat_session(
    session: Session,
    session_id: UUID,
    user_id: UUID,
) -> ChatSession:
    """
    Get a chat session by ID with ownership validation.
    """
    chat_session = session.get(ChatSession, session_id)

    if not chat_session or not chat_session.is_active:
        raise ResourceNotFound("ChatSession", str(session_id))

    if chat_session.user_id != user_id:
        raise AuthorizationError(
            message="Access denied",
            details="You do not own this chat session",
        )

    return chat_session


def list_user_sessions(
    session: Session,
    user_id: UUID,
    limit: int = 50,
    include_inactive: bool = False,
) -> List[ChatSession]:
    """
    List all chat sessions for a user.
    """
    query = select(ChatSession).where(ChatSession.user_id == user_id)

    if not include_inactive:
        query = query.where(ChatSession.is_active == True)

    query = query.order_by(col(ChatSession.updated_at).desc()).limit(limit)

    return list(session.exec(query).all())


def update_session_title(
    session: Session,
    session_id: UUID,
    user_id: UUID,
    title: str,
) -> ChatSession:
    """
    Update the title of a chat session.
    """
    chat_session = get_chat_session(session, session_id, user_id)
    chat_session.title = title
    session.add(chat_session)
    session.commit()
    session.refresh(chat_session)
    return chat_session


def delete_chat_session(
    session: Session,
    session_id: UUID,
    user_id: UUID,
) -> None:
    """
    Soft-delete a chat session.
    """
    chat_session = get_chat_session(session, session_id, user_id)
    chat_session.is_active = False
    session.add(chat_session)
    session.commit()

    record_audit_event(
        event_type="CHAT_SESSION_DELETED",
        user_id=str(user_id),
        resource_type="ChatSession",
        resource_id=str(session_id),
    )


# =============================================================================
# Message Management
# =============================================================================


def add_user_message(
    session: Session,
    session_id: UUID,
    user_id: UUID,
    content: str,
) -> ChatMessage:
    """
    Add a user message to a chat session.
    """
    chat_session = get_chat_session(session, session_id, user_id)

    message = ChatMessage(
        session_id=session_id,
        role=MessageRole.USER,
        content=content,
        sequence=chat_session.message_count + 1,
    )

    chat_session.message_count += 1

    session.add(message)
    session.add(chat_session)
    session.commit()
    session.refresh(message)

    return message


def add_assistant_message(
    session: Session,
    session_id: UUID,
    content: str,
    output_data: Optional[Dict[str, Any]] = None,
    intent_type: Optional[str] = None,
) -> ChatMessage:
    """
    Add an assistant message to a chat session.
    
    Called internally after analysis execution.
    """
    chat_session = session.get(ChatSession, session_id)
    if not chat_session:
        raise ResourceNotFound("ChatSession", str(session_id))

    message = ChatMessage(
        session_id=session_id,
        role=MessageRole.ASSISTANT,
        content=content,
        output_data=output_data,
        intent_type=intent_type,
        sequence=chat_session.message_count + 1,
    )

    chat_session.message_count += 1

    session.add(message)
    session.add(chat_session)
    session.commit()
    session.refresh(message)

    return message


def get_session_messages(
    session: Session,
    session_id: UUID,
    user_id: UUID,
    limit: int = 100,
) -> List[ChatMessage]:
    """
    Get all messages in a chat session.
    """
    # Validate ownership
    get_chat_session(session, session_id, user_id)

    query = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.sequence)
        .limit(limit)
    )

    return list(session.exec(query).all())


def get_recent_context(
    session: Session,
    session_id: UUID,
    max_messages: int = 10,
) -> List[Dict[str, str]]:
    """
    Get recent messages for LLM context.
    
    Returns messages in format suitable for LLM prompt.
    """
    query = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(col(ChatMessage.sequence).desc())
        .limit(max_messages)
    )

    messages = list(session.exec(query).all())
    messages.reverse()  # Oldest first

    context_list = []
    for msg in messages:
        text = msg.content
        if msg.role.value == "assistant" and msg.output_data and isinstance(msg.output_data, dict):
            sql = msg.output_data.get("sql")
            if sql:
                text += f"\n[The data for this response was generated using SQL: `{sql}`]"
        
        context_list.append({"role": msg.role.value, "content": text})

    return context_list


def auto_generate_title(
    session: Session,
    session_id: UUID,
    first_message: str,
) -> None:
    """
    Auto-generate a session title from the first message.
    """
    chat_session = session.get(ChatSession, session_id)
    if not chat_session:
        return

    # Use first 50 chars of first message as title
    title = first_message[:50]
    if len(first_message) > 50:
        title += "..."

    chat_session.title = title
    session.add(chat_session)
    session.commit()
