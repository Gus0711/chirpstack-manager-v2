from pydantic import BaseModel, Field
from datetime import datetime


class ProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    required_tags: list[str] = []
    tag_values: dict[str, str] = {}
    device_profile: dict = {}


class ProfileUpdate(BaseModel):
    name: str | None = None
    required_tags: list[str] | None = None
    tag_values: dict[str, str] | None = None
    device_profile: dict | None = None


class ProfileRead(BaseModel):
    id: str
    name: str
    required_tags: list[str]
    tag_values: dict
    device_profile: dict
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
