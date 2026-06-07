from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import session
from app.models import models
from app.schemas import user as user_schemas
from app.core import security
from app.core.config import settings

router = APIRouter()

@router.post("/register", response_model=user_schemas.UserRead)
async def register(
    *,
    db: AsyncSession = Depends(session.get_db),
    user_in: user_schemas.UserCreate
) -> Any:
    # Check if user with same email exists
    stmt = select(models.User).filter(models.User.email == user_in.email)
    result = await db.execute(stmt)
    user = result.scalars().first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )
    
    # Check if user with same username exists
    stmt_username = select(models.User).filter(models.User.username == user_in.username)
    result_username = await db.execute(stmt_username)
    user_by_username = result_username.scalars().first()
    if user_by_username:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system",
        )
        
    user = models.User(
        email=user_in.email,
        username=user_in.username,
        full_name=user_in.full_name,
        password_hash=security.get_password_hash(user_in.password),
        faculty=user_in.faculty,
        department=user_in.department,
        bio=user_in.bio
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/login", response_model=user_schemas.Token)
async def login(
    *,
    db: AsyncSession = Depends(session.get_db),
    user_in: user_schemas.UserLogin
) -> Any:
    stmt = select(models.User).filter(models.User.username == user_in.username)
    result = await db.execute(stmt)
    user = result.scalars().first()
    
    if not user:
        # Check by email as a fallback
        stmt_email = select(models.User).filter(models.User.email == user_in.username)
        result_email = await db.execute(stmt_email)
        user = result_email.scalars().first()
        
    if not user or not security.verify_password(user_in.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
        
    return {
        "access_token": security.create_access_token(user.id),
        "token_type": "bearer",
    }

import httpx
from fastapi.responses import RedirectResponse

@router.get("/google/url")
async def get_google_url():
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the backend .env file."
        )

    if not settings.GOOGLE_REDIRECT_URI:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google redirect URI is not configured. Set GOOGLE_REDIRECT_URI in the backend .env file."
        )

    url = f"https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={settings.GOOGLE_CLIENT_ID}&redirect_uri={settings.GOOGLE_REDIRECT_URI}&scope=openid%20email%20profile&access_type=offline"
    return {"url": url}

@router.get("/google/callback")
async def google_callback(
    code: str,
    db: AsyncSession = Depends(session.get_db)
):
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=data)
        token_data = response.json()
        access_token = token_data.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to retrieve Google token")
            
        user_info = await client.get(
            "https://www.googleapis.com/oauth2/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        user_data = user_info.json()
        
    email = user_data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Could not retrieve email from Google")
        
    stmt = select(models.User).filter(models.User.email == email)
    result = await db.execute(stmt)
    user = result.scalars().first()
    
    admin_emails = [e.strip() for e in settings.GOOGLE_ADMIN_EMAILS.split(",") if e.strip()]
    is_admin = email in admin_emails
    
    if not user:
        user = models.User(
            email=email,
            username=email.split("@")[0] + str(hash(email))[:4], # Ensure uniqueness
            full_name=user_data.get("name", "Google User"),
            password_hash=security.get_password_hash(email),
            profile_picture=user_data.get("picture"),
            role="admin" if is_admin else "student",
            verified=True
        )
        db.add(user)
    else:
        if is_admin and user.role != "admin":
            user.role = "admin"
        if not user.profile_picture:
            user.profile_picture = user_data.get("picture")
            
    await db.commit()
    await db.refresh(user)
    
    jwt_token = security.create_access_token(user.id)
    
    redirect_url = f"{settings.FRONTEND_URL}/auth/callback?token={jwt_token}"
    return RedirectResponse(url=redirect_url)
