"""API entrypoint for the image annotation tool."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import auth
from app.db import SessionLocal
from app.routes import annotations, export, images, reviews, tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        auth.seed_demo_users(db)
    yield


app = FastAPI(title="Image Annotation Tool API", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(images.router)
app.include_router(tasks.router)
app.include_router(annotations.router)
app.include_router(reviews.router)
app.include_router(export.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
