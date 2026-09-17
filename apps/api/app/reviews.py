from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from app.imports import OBSERVATION_MODELS, OWNERSHIP_BASES, PRODUCTION_STAGES, observation_snapshot
from app.models import ReviewItem, User, utcnow


EDITABLE_FIELDS = {
    "original_value",
    "normalized_value",
    "missing_reason",
    "original_unit",
    "normalized_unit",
    "effective_date",
    "ownership_basis",
    "production_stage",
    "source_locator",
    "notes",
}


def normalize_review_changes(changes: dict[str, Any]) -> dict[str, Any]:
    unknown = set(changes) - EDITABLE_FIELDS
    if unknown:
        raise ValueError(f"不可修改字段: {', '.join(sorted(unknown))}")
    normalized = dict(changes)
    for field in {"original_value", "normalized_value"} & changes.keys():
        value = changes[field]
        if value is None:
            normalized[field] = None
            continue
        try:
            normalized[field] = Decimal(str(value))
        except (InvalidOperation, ValueError) as exc:
            raise ValueError(f"{field} 必须为数值或 null") from exc
    if "effective_date" in changes:
        value = changes["effective_date"]
        try:
            normalized["effective_date"] = value if isinstance(value, date) else date.fromisoformat(str(value))
        except ValueError as exc:
            raise ValueError("effective_date 必须为 YYYY-MM-DD") from exc
    if "ownership_basis" in changes and changes["ownership_basis"] not in OWNERSHIP_BASES:
        raise ValueError("ownership_basis 非法")
    if "production_stage" in changes and changes["production_stage"] not in PRODUCTION_STAGES:
        raise ValueError("production_stage 非法")
    for field in {"normalized_unit", "source_locator"} & changes.keys():
        if not isinstance(changes[field], str) or not changes[field].strip():
            raise ValueError(f"{field} 不得为空")
        normalized[field] = changes[field].strip()
    for field in {"original_unit", "missing_reason", "notes"} & changes.keys():
        value = changes[field]
        if value is not None and not isinstance(value, str):
            raise ValueError(f"{field} 必须为字符串或 null")
        normalized[field] = value.strip() if isinstance(value, str) and value.strip() else None
    return normalized


def get_observation(db: Session, review: ReviewItem):
    model = OBSERVATION_MODELS.get(review.observation_type)
    if not model:
        raise ValueError("未知观察记录类型")
    observation = db.get(model, review.observation_id)
    if not observation:
        raise ValueError("观察记录不存在")
    return observation


def accept_and_publish(db: Session, review: ReviewItem, user: User, comment: str | None = None) -> None:
    observation = get_observation(db, review)
    observation.review_status = "approved"
    observation.published = True
    review.status = "approved_published"
    review.reviewer_id = user.id
    review.reviewer_comment = comment
    review.after_payload = observation_snapshot(observation)
    review.reviewed_at = utcnow()
    db.commit()


def modify_accept_and_publish(db: Session, review: ReviewItem, user: User, changes: dict[str, Any], comment: str | None = None) -> None:
    normalized_changes = normalize_review_changes(changes)
    observation = get_observation(db, review)
    before = observation_snapshot(observation)
    for field, value in normalized_changes.items():
        setattr(observation, field, value)
    if observation.normalized_value is None and not observation.missing_reason:
        raise ValueError("数值为空时必须填写 missing_reason")
    observation.row_version += 1
    observation.review_status = "approved"
    observation.published = True
    review.status = "modified_approved_published"
    review.before_payload = before
    review.after_payload = observation_snapshot(observation)
    review.reviewer_id = user.id
    review.reviewer_comment = comment
    review.reviewed_at = utcnow()
    db.commit()


def reject(db: Session, review: ReviewItem, user: User, comment: str | None = None) -> None:
    observation = get_observation(db, review)
    observation.review_status = "rejected"
    observation.published = False
    review.status = "rejected"
    review.reviewer_id = user.id
    review.reviewer_comment = comment
    review.after_payload = observation_snapshot(observation)
    review.reviewed_at = utcnow()
    db.commit()
