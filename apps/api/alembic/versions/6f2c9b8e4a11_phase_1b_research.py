"""phase 1b research workflow

Revision ID: 6f2c9b8e4a11
Revises: 11403e40168f
Create Date: 2026-09-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6f2c9b8e4a11"
down_revision: Union[str, None] = "11403e40168f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


OBSERVATION_TABLES = (
    "production_observations",
    "guidance_observations",
    "reserve_observations",
)


def upgrade() -> None:
    op.alter_column("sources", "published_at", existing_type=sa.Date(), nullable=True)
    op.alter_column("sources", "verified_at", existing_type=sa.Date(), nullable=True)
    op.add_column("sources", sa.Column("normalized_url", sa.String(1000), nullable=True))
    op.add_column("sources", sa.Column("final_url", sa.String(1000), nullable=True))
    op.add_column("sources", sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sources", sa.Column("mime_type", sa.String(200), nullable=True))
    op.add_column("sources", sa.Column("sha256", sa.String(64), nullable=True))
    op.add_column("sources", sa.Column("local_storage_path", sa.String(1000), nullable=True))
    op.add_column("sources", sa.Column("http_status", sa.Integer(), nullable=True))
    op.add_column("sources", sa.Column("retrieval_method", sa.String(32), nullable=True))
    op.add_column("sources", sa.Column("terms_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sources", sa.Column("terms_status", sa.String(32), nullable=True))
    op.add_column("sources", sa.Column("robots_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sources", sa.Column("robots_status", sa.String(32), nullable=True))
    op.add_column("sources", sa.Column("parse_status", sa.String(32), server_default="not_parsed", nullable=False))
    op.add_column("sources", sa.Column("source_tier", sa.String(1), nullable=True))
    op.add_column("sources", sa.Column("content_length", sa.Integer(), nullable=True))
    op.add_column("sources", sa.Column("last_fetch_error", sa.Text(), nullable=True))
    op.create_unique_constraint("uq_sources_normalized_url", "sources", ["normalized_url"])
    op.create_unique_constraint("uq_sources_sha256", "sources", ["sha256"])
    op.create_check_constraint("ck_source_tier", "sources", "source_tier IS NULL OR source_tier IN ('A','B')")
    op.create_check_constraint("ck_source_parse_status", "sources", "parse_status IN ('not_parsed','parsed','failed')")

    op.create_table(
        "research_runs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("requested_by", sa.String(36), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("requested_metrics", sa.JSON(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('active','completed','failed')", name="ck_research_run_status"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_research_runs_project_created", "research_runs", ["project_id", "created_at"])

    op.create_table(
        "research_discoveries",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("research_run_id", sa.String(36), nullable=False),
        sa.Column("query", sa.Text(), nullable=True),
        sa.Column("original_url", sa.String(1000), nullable=False),
        sa.Column("normalized_url", sa.String(1000), nullable=False),
        sa.Column("result_title", sa.String(500), nullable=True),
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("result_rank", sa.Integer(), nullable=True),
        sa.Column("discovery_method", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("source_document_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('discovered','fetched','failed','ignored')", name="ck_research_discovery_status"),
        sa.ForeignKeyConstraint(["research_run_id"], ["research_runs.id"]),
        sa.ForeignKeyConstraint(["source_document_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("research_run_id", "normalized_url", name="uq_research_discovery_url"),
    )

    op.create_table(
        "source_fetch_attempts",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("research_run_id", sa.String(36), nullable=False),
        sa.Column("discovery_id", sa.String(36), nullable=True),
        sa.Column("source_document_id", sa.String(36), nullable=True),
        sa.Column("requested_url", sa.String(1000), nullable=False),
        sa.Column("final_url", sa.String(1000), nullable=True),
        sa.Column("redirect_chain", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('started','succeeded','failed','blocked','rate_limited')", name="ck_source_fetch_status"),
        sa.ForeignKeyConstraint(["discovery_id"], ["research_discoveries.id"]),
        sa.ForeignKeyConstraint(["research_run_id"], ["research_runs.id"]),
        sa.ForeignKeyConstraint(["source_document_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_source_fetch_attempts_run_started", "source_fetch_attempts", ["research_run_id", "started_at"])

    op.create_table(
        "document_evidence",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("source_document_id", sa.String(36), nullable=False),
        sa.Column("evidence_type", sa.String(32), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("page_label", sa.String(64), nullable=True),
        sa.Column("table_title", sa.String(500), nullable=True),
        sa.Column("sheet_name", sa.String(200), nullable=True),
        sa.Column("cell_range", sa.String(64), nullable=True),
        sa.Column("json_path", sa.String(500), nullable=True),
        sa.Column("quoted_excerpt", sa.Text(), nullable=False),
        sa.Column("context_before", sa.Text(), nullable=True),
        sa.Column("context_after", sa.Text(), nullable=True),
        sa.Column("evidence_locator", sa.JSON(), nullable=False),
        sa.Column("locator_hash", sa.String(64), nullable=False),
        sa.Column("extraction_method", sa.String(32), nullable=False),
        sa.Column("ai_confidence", sa.Numeric(5, 4), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("evidence_type IN ('pdf_page','html_section','table','cell','json_path')", name="ck_evidence_type"),
        sa.CheckConstraint("page_number IS NULL OR page_number >= 1", name="ck_evidence_page_number"),
        sa.CheckConstraint("ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)", name="ck_evidence_confidence"),
        sa.ForeignKeyConstraint(["source_document_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_document_id", "locator_hash", name="uq_document_evidence_locator"),
    )

    op.create_table(
        "research_candidates",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("research_run_id", sa.String(36), nullable=False),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("entity_type", sa.String(32), nullable=False),
        sa.Column("metric_type", sa.String(32), nullable=False),
        sa.Column("raw_value", sa.String(100), nullable=True),
        sa.Column("raw_unit", sa.String(32), nullable=True),
        sa.Column("normalized_value", sa.Numeric(24, 6), nullable=True),
        sa.Column("normalized_unit", sa.String(32), nullable=True),
        sa.Column("missing_reason", sa.String(64), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("effective_date", sa.Date(), nullable=True),
        sa.Column("calendar_basis", sa.String(32), nullable=True),
        sa.Column("fiscal_year_label", sa.String(32), nullable=True),
        sa.Column("fiscal_year_start_month", sa.Integer(), nullable=True),
        sa.Column("period_type", sa.String(32), nullable=True),
        sa.Column("production_stage", sa.String(64), nullable=True),
        sa.Column("ownership_basis", sa.String(32), nullable=True),
        sa.Column("source_document_id", sa.String(36), nullable=False),
        sa.Column("evidence_id", sa.String(36), nullable=False),
        sa.Column("confidence", sa.Numeric(5, 4), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("blocking_issues", sa.JSON(), nullable=False),
        sa.Column("validation_warnings", sa.JSON(), nullable=False),
        sa.Column("unresolved_fields", sa.JSON(), nullable=False),
        sa.Column("candidate_payload", sa.JSON(), nullable=False),
        sa.Column("extracted_payload", sa.JSON(), nullable=False),
        sa.Column("extraction_method", sa.String(32), nullable=False),
        sa.Column("extraction_model", sa.String(200), nullable=True),
        sa.Column("extraction_prompt_version", sa.String(64), nullable=True),
        sa.Column("candidate_fingerprint", sa.String(64), nullable=False),
        sa.Column("candidate_snapshot", sa.JSON(), nullable=True),
        sa.Column("published_snapshot", sa.JSON(), nullable=True),
        sa.Column("administrator_changes", sa.JSON(), nullable=True),
        sa.Column("supersedes_observation_id", sa.String(36), nullable=True),
        sa.Column("published_observation_type", sa.String(32), nullable=True),
        sa.Column("published_observation_id", sa.String(36), nullable=True),
        sa.Column("confirmed_by", sa.String(36), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("metric_type IN ('production','guidance','reserves')", name="ck_candidate_metric_type"),
        sa.CheckConstraint("status IN ('ready','needs_attention','ignored','published')", name="ck_candidate_status"),
        sa.CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_candidate_confidence"),
        sa.CheckConstraint("extraction_method IN ('fixture','deterministic','ai','manual')", name="ck_candidate_extraction_method"),
        sa.ForeignKeyConstraint(["confirmed_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["evidence_id"], ["document_evidence.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["research_run_id"], ["research_runs.id"]),
        sa.ForeignKeyConstraint(["source_document_id"], ["sources.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("candidate_fingerprint"),
    )
    op.create_index("ix_research_candidates_project_status", "research_candidates", ["project_id", "status"])

    for table in OBSERVATION_TABLES:
        op.add_column(table, sa.Column("evidence_id", sa.String(36), nullable=True))
        op.add_column(table, sa.Column("research_candidate_id", sa.String(36), nullable=True))
        op.add_column(table, sa.Column("is_current", sa.Boolean(), server_default=sa.true(), nullable=False))
        op.add_column(table, sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("confirmed_by", sa.String(36), nullable=True))
        op.add_column(table, sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("supersedes_id", sa.String(36), nullable=True))
        op.create_foreign_key(f"fk_{table}_evidence", table, "document_evidence", ["evidence_id"], ["id"])
        op.create_foreign_key(f"fk_{table}_candidate", table, "research_candidates", ["research_candidate_id"], ["id"])
        op.create_foreign_key(f"fk_{table}_confirmed_by", table, "users", ["confirmed_by"], ["id"])
        op.create_foreign_key(f"fk_{table}_supersedes", table, table, ["supersedes_id"], ["id"])
        op.create_unique_constraint(f"uq_{table}_candidate", table, ["research_candidate_id"])
        op.create_unique_constraint(f"uq_{table}_supersedes", table, ["supersedes_id"])

    op.add_column("review_items", sa.Column("research_candidate_id", sa.String(36), nullable=True))
    op.create_foreign_key("fk_review_items_candidate", "review_items", "research_candidates", ["research_candidate_id"], ["id"])
    op.create_unique_constraint("uq_review_items_candidate", "review_items", ["research_candidate_id"])


def downgrade() -> None:
    op.drop_constraint("uq_review_items_candidate", "review_items", type_="unique")
    op.drop_constraint("fk_review_items_candidate", "review_items", type_="foreignkey")
    op.drop_column("review_items", "research_candidate_id")

    for table in reversed(OBSERVATION_TABLES):
        op.drop_constraint(f"uq_{table}_supersedes", table, type_="unique")
        op.drop_constraint(f"uq_{table}_candidate", table, type_="unique")
        op.drop_constraint(f"fk_{table}_supersedes", table, type_="foreignkey")
        op.drop_constraint(f"fk_{table}_confirmed_by", table, type_="foreignkey")
        op.drop_constraint(f"fk_{table}_candidate", table, type_="foreignkey")
        op.drop_constraint(f"fk_{table}_evidence", table, type_="foreignkey")
        for column in ("supersedes_id", "confirmed_at", "confirmed_by", "superseded_at", "is_current", "research_candidate_id", "evidence_id"):
            op.drop_column(table, column)

    op.drop_index("ix_research_candidates_project_status", table_name="research_candidates")
    op.drop_table("research_candidates")
    op.drop_table("document_evidence")
    op.drop_index("ix_source_fetch_attempts_run_started", table_name="source_fetch_attempts")
    op.drop_table("source_fetch_attempts")
    op.drop_table("research_discoveries")
    op.drop_index("ix_research_runs_project_created", table_name="research_runs")
    op.drop_table("research_runs")

    op.drop_constraint("ck_source_parse_status", "sources", type_="check")
    op.drop_constraint("ck_source_tier", "sources", type_="check")
    op.drop_constraint("uq_sources_sha256", "sources", type_="unique")
    op.drop_constraint("uq_sources_normalized_url", "sources", type_="unique")
    for column in (
        "last_fetch_error", "content_length", "source_tier", "parse_status",
        "robots_status", "robots_checked_at", "terms_status", "terms_checked_at",
        "retrieval_method", "http_status", "local_storage_path", "sha256",
        "mime_type", "fetched_at", "final_url", "normalized_url",
    ):
        op.drop_column("sources", column)
    op.alter_column("sources", "verified_at", existing_type=sa.Date(), nullable=False)
    op.alter_column("sources", "published_at", existing_type=sa.Date(), nullable=False)
