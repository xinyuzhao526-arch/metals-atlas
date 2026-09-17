from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import ProjectOwnership


def validate_ownership_overlap(
    db: Session,
    project_id: str,
    company_id: str,
    valid_from: date,
    valid_to: date | None,
    exclude_id: str | None = None,
) -> None:
    incoming_end = valid_to or date.max
    query = select(ProjectOwnership).where(
        ProjectOwnership.project_id == project_id,
        ProjectOwnership.company_id == company_id,
        ProjectOwnership.valid_from <= incoming_end,
        or_(ProjectOwnership.valid_to.is_(None), ProjectOwnership.valid_to >= valid_from),
    )
    if exclude_id:
        query = query.where(ProjectOwnership.id != exclude_id)
    if db.scalar(query):
        raise ValueError("持股有效期与现有记录重叠")

