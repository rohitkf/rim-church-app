from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import assistant

app = FastAPI(title="Church Ops Platform — AI Assistant Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assistant.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
