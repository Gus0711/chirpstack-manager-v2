from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Annotated

from ..database import get_db
from ..auth.dependencies import CurrentUser, AdminOrAbove
from .models import ImportProfile
from .schemas import ProfileCreate, ProfileUpdate, ProfileRead

router = APIRouter(prefix="/api/profiles", tags=["profiles"])
DB = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[ProfileRead])
def list_profiles(current_user: CurrentUser, db: DB):
    return db.query(ImportProfile).order_by(ImportProfile.name).all()


@router.post("", response_model=ProfileRead, status_code=201)
def create_profile(body: ProfileCreate, current_user: AdminOrAbove, db: DB):
    if db.query(ImportProfile).filter(ImportProfile.name == body.name).first():
        raise HTTPException(status_code=409, detail="Profile name already exists")

    profile = ImportProfile(
        name=body.name,
        required_tags=body.required_tags,
        tag_values=body.tag_values,
        device_profile=body.device_profile,
        created_by=current_user.id,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=ProfileRead)
def get_profile(profile_id: str, current_user: CurrentUser, db: DB):
    profile = db.query(ImportProfile).filter(ImportProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/{profile_id}", response_model=ProfileRead)
def update_profile(
    profile_id: str, body: ProfileUpdate, current_user: AdminOrAbove, db: DB
):
    profile = db.query(ImportProfile).filter(ImportProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if body.name is not None:
        existing = (
            db.query(ImportProfile)
            .filter(ImportProfile.name == body.name, ImportProfile.id != profile_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Profile name already exists")
        profile.name = body.name
    if body.required_tags is not None:
        profile.required_tags = body.required_tags
    if body.tag_values is not None:
        profile.tag_values = body.tag_values
    if body.device_profile is not None:
        profile.device_profile = body.device_profile

    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: str, current_user: AdminOrAbove, db: DB):
    profile = db.query(ImportProfile).filter(ImportProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete(profile)
    db.commit()
