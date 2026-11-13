from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .db import Base, SessionLocal, engine
from .routers import auth_settings, clients, dashboard, ideas, invoices, portal, quotations, training, work
from .seed import seed



@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="Manima Client Hub", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth_settings, clients, quotations, invoices, training, work, ideas, dashboard, portal):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
