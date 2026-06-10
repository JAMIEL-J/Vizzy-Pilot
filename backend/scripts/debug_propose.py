import asyncio
import traceback
from sqlmodel import Session
from app.models.database import engine
from app.services.dataset_version_service import propose_semantic_mapping
from uuid import UUID

def main():
    s = Session(engine)
    try:
        out = asyncio.run(propose_semantic_mapping(s, UUID('c75e24b1-facc-4ce9-bea9-78bd79d11ad0')))
        print('OUT:', out)
    except Exception as e:
        print('EXC:', repr(e))
        traceback.print_exc()

if __name__ == '__main__':
    main()
