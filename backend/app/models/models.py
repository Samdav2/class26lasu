from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, JSON, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database.session import Base

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    STUDENT = "student"
    GUARDIAN = "guardian"

class MediaType(str, enum.Enum):
    IMAGE = "image"
    VIDEO = "video"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    profile_picture = Column(String, nullable=True)
    faculty = Column(String, index=True)
    department = Column(String)
    graduation_year = Column(Integer, default=2026)
    role = Column(String, default=UserRole.STUDENT)
    bio = Column(Text, nullable=True)
    social_links = Column(JSON, default={})
    verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    memories = relationship("Memory", back_populates="uploader")
    comments = relationship("Comment", back_populates="user")
    rsvps = relationship("RSVP", back_populates="user")

class Category(Base):
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    icon = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Memory(Base):
    __tablename__ = "memories"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text)
    media_url = Column(String, nullable=False)
    thumbnail_url = Column(String)
    media_type = Column(String, default=MediaType.IMAGE)
    uploader_id = Column(Integer, ForeignKey("users.id"))
    category_id = Column(Integer, ForeignKey("categories.id"))
    faculty = Column(String, index=True)
    tags = Column(String) # Comma separated
    people = Column(String) # Comma separated tagged people
    uploader_name = Column(String, default="Anonymous")
    views = Column(Integer, default=0)
    likes_count = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    featured = Column(Boolean, default=False)
    visibility = Column(String, default="public")
    approved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    uploader = relationship("User", back_populates="memories")
    comments = relationship("Comment", back_populates="memory")

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    memory_id = Column(Integer, ForeignKey("memories.id"))
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="comments")
    memory = relationship("Memory", back_populates="comments")

class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    flyer_image = Column(String)
    event_date = Column(DateTime(timezone=True))
    location = Column(String)
    regular_price = Column(Float, default=0.0)
    vip_price = Column(Float, default=0.0)
    qr_code = Column(String)
    featured = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    rsvps = relationship("RSVP", back_populates="event")

class RSVP(Base):
    __tablename__ = "rsvps"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    event_id = Column(Integer, ForeignKey("events.id"))
    ticket_type = Column(String, default="regular")
    payment_status = Column(String, default="pending")
    qr_ticket = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="rsvps")
    event = relationship("Event", back_populates="rsvps")
