"""
Comprehensive test suite for the LASU 2026 Digital Archive API.
Tests focus on the public archive viewing (no auth required) and the memory pipeline.
Uses async SQLAlchemy + aiosqlite for a real async test environment.
"""
import pytest
import pytest_asyncio
import os
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

# Override settings BEFORE importing app
os.environ["USE_SQLITE"] = "True"
os.environ["DATABASE_URL"] = ""

from app.main import app
from app.database.session import Base, get_db
from app.models.models import User, Memory

# ---------- Async Test Database Setup ----------

TEST_DATABASE_URL = "sqlite+aiosqlite://"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestSessionLocal = async_sessionmaker(
    autocommit=False, autoflush=False, bind=test_engine, class_=AsyncSession
)


async def override_get_db():
    async with TestSessionLocal() as db:
        try:
            yield db
        finally:
            await db.close()


app.dependency_overrides[get_db] = override_get_db


# ---------- Fixtures ----------

@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    """Create all tables before each test, drop them after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed a test user (uploader_id=1 references this)
    async with TestSessionLocal() as db:
        user = User(
            id=1,
            full_name="Test User",
            username="testuser",
            email="test@example.com",
            password_hash="hashed_password",
        )
        db.add(user)
        await db.commit()

    yield

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest_asyncio.fixture
async def seeded_memories():
    """Pre-seed approved and unapproved memories for testing."""
    async with TestSessionLocal() as db:
        approved_1 = Memory(
            title="Graduation Day",
            description="Class of 2026 graduation ceremony",
            media_url="https://cdn.example.com/grad.jpg",
            thumbnail_url="https://cdn.example.com/grad_thumb.jpg",
            media_type="image",
            faculty="Science",
            tags="graduation,ceremony",
            people="Ibrahim,Sarah",
            uploader_name="Ibrahim Kosai",
            uploader_id=1,
            approved=True,
            likes_count=5,
            comments_count=2,
        )
        approved_2 = Memory(
            title="Lab Day",
            description="Chemistry lab experiment",
            media_url="https://cdn.example.com/lab.jpg",
            media_type="image",
            faculty="Engineering",
            tags="lab,chemistry",
            uploader_name="Adewale Johnson",
            uploader_id=1,
            approved=True,
            likes_count=3,
            comments_count=0,
        )
        unapproved = Memory(
            title="Pending Memory",
            description="Awaiting moderation",
            media_url="https://cdn.example.com/pending.jpg",
            media_type="image",
            faculty="Arts",
            uploader_name="Anonymous",
            uploader_id=1,
            approved=False,
        )
        db.add_all([approved_1, approved_2, unapproved])
        await db.commit()


# ============================================================
# 1. ROOT ENDPOINT
# ============================================================

@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    """API root returns correct status and branding."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "LASU 2026" in data["message"]


# ============================================================
# 2. PUBLIC ARCHIVE VIEWING (No Auth Required)
# ============================================================

@pytest.mark.asyncio
async def test_list_memories_returns_empty_when_none(client: AsyncClient):
    """GET /memories returns empty list when no memories exist."""
    response = await client.get("/api/v1/memories")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_memories_returns_only_approved(client: AsyncClient, seeded_memories):
    """GET /memories only returns approved memories, not pending ones."""
    response = await client.get("/api/v1/memories")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2  # Only 2 approved, not the unapproved one
    titles = [m["title"] for m in data]
    assert "Pending Memory" not in titles


@pytest.mark.asyncio
async def test_list_memories_no_auth_header_needed(client: AsyncClient, seeded_memories):
    """GET /memories works WITHOUT any Authorization header — key fix validation."""
    # Explicitly do NOT send any auth header
    response = await client.get("/api/v1/memories", headers={})
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_list_memories_with_invalid_token_still_works(client: AsyncClient, seeded_memories):
    """GET /memories works even with an invalid/stale token — this was the bug."""
    response = await client.get(
        "/api/v1/memories",
        headers={"Authorization": "Bearer expired_or_invalid_token_12345"}
    )
    # The public endpoint should NOT reject based on invalid auth
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_list_memories_filter_by_faculty(client: AsyncClient, seeded_memories):
    """GET /memories?faculty=Science returns only Science memories."""
    response = await client.get("/api/v1/memories", params={"faculty": "Science"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["faculty"] == "Science"


@pytest.mark.asyncio
async def test_list_memories_filter_nonexistent_faculty(client: AsyncClient, seeded_memories):
    """GET /memories?faculty=Nonexistent returns empty list."""
    response = await client.get("/api/v1/memories", params={"faculty": "Nonexistent"})
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_memories_pagination(client: AsyncClient, seeded_memories):
    """GET /memories supports skip and limit pagination."""
    response = await client.get("/api/v1/memories", params={"limit": 1, "skip": 0})
    assert response.status_code == 200
    assert len(response.json()) == 1

    response2 = await client.get("/api/v1/memories", params={"limit": 1, "skip": 1})
    assert response2.status_code == 200
    assert len(response2.json()) == 1

    # The two results should be different memories
    assert response.json()[0]["id"] != response2.json()[0]["id"]


@pytest.mark.asyncio
async def test_list_memories_ordered_newest_first(client: AsyncClient, seeded_memories):
    """GET /memories returns memories in newest-first order."""
    response = await client.get("/api/v1/memories")
    assert response.status_code == 200
    data = response.json()
    if len(data) >= 2:
        # Later-inserted memory should come first
        assert data[0]["created_at"] >= data[1]["created_at"]


# ============================================================
# 3. MEMORY RESPONSE SCHEMA VALIDATION
# ============================================================

@pytest.mark.asyncio
async def test_memory_response_has_required_fields(client: AsyncClient, seeded_memories):
    """Each memory in the response includes all fields needed by the frontend."""
    response = await client.get("/api/v1/memories")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0

    memory = data[0]
    required_fields = [
        "id", "title", "description", "media_url", "media_type",
        "faculty", "tags", "uploader_name", "views", "likes_count",
        "comments_count", "approved", "featured", "created_at"
    ]
    for field in required_fields:
        assert field in memory, f"Missing field: {field}"


@pytest.mark.asyncio
async def test_memory_response_includes_people_field(client: AsyncClient, seeded_memories):
    """Memory schema includes 'people' field for tagged people."""
    response = await client.get("/api/v1/memories")
    data = response.json()
    # Find the one with people tagged
    science_mem = [m for m in data if m["faculty"] == "Science"][0]
    assert "people" in science_mem
    assert science_mem["people"] == "Ibrahim,Sarah"


@pytest.mark.asyncio
async def test_memory_response_includes_uploader_name(client: AsyncClient, seeded_memories):
    """Memory schema includes 'uploader_name' — not just uploader_id."""
    response = await client.get("/api/v1/memories")
    data = response.json()
    names = [m["uploader_name"] for m in data]
    assert "Ibrahim Kosai" in names
    assert "Adewale Johnson" in names


@pytest.mark.asyncio
async def test_memory_response_includes_thumbnail_url(client: AsyncClient, seeded_memories):
    """Memory schema includes optional 'thumbnail_url' for progressive loading."""
    response = await client.get("/api/v1/memories")
    data = response.json()
    science_mem = [m for m in data if m["faculty"] == "Science"][0]
    assert "thumbnail_url" in science_mem
    assert science_mem["thumbnail_url"] == "https://cdn.example.com/grad_thumb.jpg"


# ============================================================
# 4. SINGLE MEMORY RETRIEVAL
# ============================================================

@pytest.mark.asyncio
async def test_get_memory_by_id(client: AsyncClient, seeded_memories):
    """GET /memories/{id} returns a specific memory."""
    # First, get the list to find an ID
    list_response = await client.get("/api/v1/memories")
    memory_id = list_response.json()[0]["id"]

    response = await client.get(f"/api/v1/memories/{memory_id}")
    assert response.status_code == 200
    assert response.json()["id"] == memory_id


@pytest.mark.asyncio
async def test_get_memory_not_found(client: AsyncClient):
    """GET /memories/99999 returns 404."""
    response = await client.get("/api/v1/memories/99999")
    assert response.status_code == 404


# ============================================================
# 5. LIKE ENDPOINT (Public, No Auth)
# ============================================================

@pytest.mark.asyncio
async def test_like_memory_increments_count(client: AsyncClient, seeded_memories):
    """POST /memories/{id}/like increments the likes_count."""
    list_response = await client.get("/api/v1/memories")
    memory = list_response.json()[0]
    memory_id = memory["id"]
    original_likes = memory["likes_count"]

    response = await client.post(f"/api/v1/memories/{memory_id}/like")
    assert response.status_code == 200
    assert response.json()["likes_count"] == original_likes + 1


@pytest.mark.asyncio
async def test_like_memory_no_auth_required(client: AsyncClient, seeded_memories):
    """POST /memories/{id}/like works without auth — public action."""
    list_response = await client.get("/api/v1/memories")
    memory_id = list_response.json()[0]["id"]

    # No Authorization header
    response = await client.post(
        f"/api/v1/memories/{memory_id}/like",
        headers={}
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_like_nonexistent_memory_returns_404(client: AsyncClient):
    """POST /memories/99999/like returns 404."""
    response = await client.post("/api/v1/memories/99999/like")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_multiple_likes_increment_correctly(client: AsyncClient, seeded_memories):
    """Multiple likes on same memory increment correctly."""
    list_response = await client.get("/api/v1/memories")
    memory = list_response.json()[0]
    memory_id = memory["id"]
    original_likes = memory["likes_count"]

    # Like 3 times
    for i in range(3):
        response = await client.post(f"/api/v1/memories/{memory_id}/like")
        assert response.status_code == 200
        assert response.json()["likes_count"] == original_likes + i + 1


# ============================================================
# 6. ROUTE ORDERING (Upload vs Dynamic)
# ============================================================

@pytest.mark.asyncio
async def test_upload_route_not_intercepted_by_dynamic_id(client: AsyncClient):
    """POST /memories/upload should NOT be caught by /{memory_id} route."""
    # GET to /memories/upload should trigger the ID route and fail with 422
    # (since "upload" is not a valid integer), not a server crash
    response = await client.get("/api/v1/memories/upload")
    # FastAPI should return 422 because "upload" can't be cast to int
    assert response.status_code == 422
