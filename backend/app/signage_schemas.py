"""Bounded canvas documents and deliberately narrow public signage contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, field_validator, model_validator


class Document(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Background(Document):
    kind: Literal["color", "gradient", "image"] = "color"
    color: str = Field(default="#000000", pattern=r"^#[0-9a-fA-F]{6}$")
    end_color: str = Field(default="#000000", pattern=r"^#[0-9a-fA-F]{6}$")
    image: str | None = Field(default=None, pattern=r"^/uploads/signage/[a-f0-9]{32}-[a-f0-9]{64}\.jpg$")

    @model_validator(mode="after")
    def image_required(self):
        if self.kind == "image" and not self.image:
            raise ValueError("image background requires an uploaded image")
        return self


class Layer(Document):
    id: str = Field(min_length=1, max_length=64)
    kind: Literal["binding", "text", "image", "icon", "shape"]
    binding: Literal["logo", "name", "description", "sponsor", "title", "text", "icon"] | None = None
    text: str = Field(default="", max_length=500)
    image: str | None = Field(default=None, pattern=r"^/uploads/signage/[a-f0-9]{32}-[a-f0-9]{64}\.jpg$")
    icon: str | None = Field(default=None, max_length=80, pattern=r"^[a-z0-9-]+$")
    shape: Literal["rectangle", "ellipse"] = "rectangle"
    x: float = Field(default=50, ge=0, le=100, allow_inf_nan=False)
    y: float = Field(default=50, ge=0, le=100, allow_inf_nan=False)
    width: float = Field(default=50, gt=0, le=100, allow_inf_nan=False)
    height: float = Field(default=20, gt=0, le=100, allow_inf_nan=False)
    rotation: float = Field(default=0, ge=-360, le=360, allow_inf_nan=False)
    color: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")
    font_size: int = Field(default=48, ge=8, le=300)

    @model_validator(mode="after")
    def required_content(self):
        if self.kind == "binding" and not self.binding or self.kind == "image" and not self.image:
            raise ValueError("layer requires its binding or image")
        return self


class TemplateWrite(Document):
    name: str = Field(min_length=1, max_length=200)
    background: Background = Field(default_factory=Background)
    layers: list[Layer] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def unique_layers(self):
        if len({layer.id for layer in self.layers}) != len(self.layers):
            raise ValueError("layer ids must be unique")
        return self


class TemplateOut(TemplateWrite):
    id: str
    model_config = ConfigDict(from_attributes=True)


class ChannelWrite(Document):
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    name: str = Field(min_length=1, max_length=200)
    edition_id: str = Field(min_length=1, max_length=100)
    active: bool = False


class ChannelOut(ChannelWrite):
    id: str
    epoch: datetime
    revision: int
    model_config = ConfigDict(from_attributes=True)


class Content(Document):
    text_language: Literal["nl", "fr", "en"] = "en"
    text_nl: str | None = Field(default=None, max_length=500)
    text_fr: str | None = Field(default=None, max_length=500)
    text_en: str | None = Field(default=None, max_length=500)
    title_nl: str | None = Field(default=None, max_length=120)
    title_fr: str | None = Field(default=None, max_length=120)
    title_en: str | None = Field(default=None, max_length=120)
    icon: str | None = Field(default=None, max_length=80, pattern=r"^[a-z0-9-]+$")
    image: str | None = Field(default=None, pattern=r"^/uploads/signage/[a-f0-9]{32}-[a-f0-9]{64}\.jpg$")

    @field_validator("text_nl", "text_fr", "text_en", "title_nl", "title_fr", "title_en")
    @classmethod
    def strip_text(cls, value):
        return value.strip() or None if isinstance(value, str) else value


class SlideWrite(Document):
    channel_id: str
    template_id: str
    sort_order: int = Field(default=0, ge=0)
    kind: Literal["organizations", "notice", "image"]
    duration: int = Field(default=10, ge=1, le=3600)
    active: bool = False
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    content: Content = Field(default_factory=Content)

    @model_validator(mode="after")
    def validate_content(self):
        for value in (self.starts_at, self.ends_at):
            if value and value.utcoffset() is None:
                raise ValueError("schedule timestamps require a timezone")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        if self.kind == "notice" and not getattr(self.content, f"text_{self.content.text_language}"):
            raise ValueError("notice requires original-language text")
        if self.kind == "image" and not self.content.image:
            raise ValueError("image slide requires an uploaded image")
        if any(getattr(self.content, f"title_{lang}") for lang in ("nl", "fr", "en")) and not getattr(
            self.content, f"title_{self.content.text_language}"
        ):
            raise ValueError("title requires original-language text")
        return self


class SlideOut(SlideWrite):
    id: str
    model_config = ConfigDict(from_attributes=True)


class Reorder(Document):
    ordered_ids: list[str] = Field(max_length=1000)


class DisplayOrganization(Document):
    name: str
    logo: str
    description: str | None
    sponsor: bool
    sponsor_tier: str | None


class DisplayTemplate(Document):
    background: Background
    layers: list[Layer]
    model_config = ConfigDict(from_attributes=True)


class PublicSlide(Document):
    id: str
    kind: Literal["organization", "notice", "image"]
    duration: int
    template: DisplayTemplate
    text: str | None = None
    title: str | None = None
    translations: Content | None = None
    image: str | None = None
    icon: str | None = None
    organization: DisplayOrganization | None = None


class Playlist(Document):
    _max_age: int = PrivateAttr(default=5)
    revision: str
    epoch: datetime
    slides: list[PublicSlide]
