from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    chat,
    memory,
    tasks,
    agents,
    voice,
    documents,
    execute,
    workflows,
    schedules,
    apikeys,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(memory.router, prefix="/memory", tags=["memory"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(voice.router, prefix="/voice", tags=["voice"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(execute.router, prefix="/execute", tags=["execute"])
api_router.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
api_router.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
api_router.include_router(apikeys.router, prefix="/apikeys", tags=["apikeys"])
