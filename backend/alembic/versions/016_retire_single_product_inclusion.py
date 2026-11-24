"""Retire the single product inclusion in favour of `products.inclusions`.

A product used to bundle another product in two ways: the legacy pair
`included_product_id` + `included_per_guests` ("one item per N guests") and the
`inclusions` list ("quantity per parent quantity"). The pair is converted to an
explicit inclusion with `basis: "guests"` (`quantity: 1`, `per_quantity: N`,
`rounding: "down"`), which yields the same floor(guests / N) however many of the
product were ordered, so booked and future orders keep their included
quantities. The conversion also covers the frozen package rules of booked orders
(`registrations.package_snapshot`). `inclusions` then becomes non-null (an empty
list means none) and the two columns are dropped.

Malformed legacy values (a half-set pair, a target outside the product's event,
a self reference, odd JSON in `inclusions`) are repaired or discarded instead of
failing the upgrade.

Downgrade re-adds the columns and makes `inclusions` nullable again. A product
or frozen package whose only inclusion is a guest-based one-per-N edge gets its
pair back; every other guest-based edge keeps its stored `basis`, which the
previous code ignores and therefore counts per ordered quantity. Pairs or edges
discarded at upgrade are not recoverable.
"""

from decimal import Decimal, DecimalException

import sqlalchemy as sa

from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None

MAX_QUANTITY = 1_000_000
MAX_EDGES = 50
BATCH_SIZE = 500


def _text(value):
    if isinstance(value, str):
        cleaned = value.replace("\x00", "").encode("utf-8", "replace").decode("utf-8")
        return cleaned if cleaned.strip() else None
    return None


def _count(value):
    """A whole number between 0 and MAX_QUANTITY; 0 for anything unusable."""
    if isinstance(value, bool):
        return 0
    try:
        count = Decimal(str(value))
        return int(max(0, min(MAX_QUANTITY, count))) if count.is_finite() else 0
    except DecimalException, ValueError:
        return 0


def _guest_edge(target, per_guests):
    return {"product_id": target, "quantity": 1, "per_quantity": per_guests, "rounding": "down", "basis": "guests"}


def _legacy_edges(target, per_guests, *, valid_target=lambda _target: True):
    target = _text(target)
    per_guests = _count(per_guests)
    if target and per_guests and valid_target(target):
        return [_guest_edge(target, per_guests)]
    return []


def _clean_edges(raw, *, valid_target):
    edges = {}
    for entry in raw:
        edge = entry if isinstance(entry, dict) else {}
        target = _text(edge.get("product_id"))
        quantity = _count(edge.get("quantity"))
        per_quantity = _count(edge.get("per_quantity", 1))
        if target and quantity and per_quantity and valid_target(target):
            edges.setdefault(
                target,
                {
                    "product_id": target,
                    "quantity": quantity,
                    "per_quantity": per_quantity,
                    "rounding": "up" if edge.get("rounding") == "up" else "down",
                    "basis": "guests" if edge.get("basis") == "guests" else "quantity",
                },
            )
    return list(edges.values())[:MAX_EDGES]


def _only_guest_pair(inclusions):
    """The (target, per_guests) of a lone one-per-N guest edge, else None."""
    if isinstance(inclusions, list) and len(inclusions) == 1 and isinstance(inclusions[0], dict):
        edge = inclusions[0]
        if (
            edge.get("basis") == "guests"
            and edge.get("quantity") == 1
            and edge.get("rounding", "down") == "down"
            and isinstance(edge.get("product_id"), str)
            and isinstance(edge.get("per_quantity"), int)
            and edge["per_quantity"] >= 1
        ):
            return edge["product_id"], edge["per_quantity"]
    return None


def _batches(bind, table):
    last_id = None
    while True:
        query = sa.select(table).order_by(table.c.id).limit(BATCH_SIZE)
        if last_id is not None:
            query = query.where(table.c.id > last_id)
        batch = bind.execute(query).mappings().all()
        if not batch:
            return
        yield batch
        last_id = batch[-1]["id"]


def _tables(bind, product_columns):
    metadata = sa.MetaData()
    products = sa.Table(
        "products",
        metadata,
        autoload_with=bind,
        resolve_fks=False,
        include_columns=["id", "event_id", *product_columns],
    )
    registrations = sa.Table(
        "registrations", metadata, autoload_with=bind, resolve_fks=False, include_columns=["id", "package_snapshot"]
    )
    return products, registrations


def _convert_frozen_packages(bind, registrations, convert):
    for batch in _batches(bind, registrations):
        for row in batch:
            graph = row["package_snapshot"]
            if not isinstance(graph, dict):
                continue
            changed = {key: new for key, node in graph.items() if isinstance(node, dict) and (new := convert(node))}
            if changed:
                bind.execute(
                    registrations.update()
                    .where(registrations.c.id == row["id"])
                    .values(package_snapshot={**graph, **changed})
                )


def upgrade():
    bind = op.get_bind()
    products, registrations = _tables(bind, ["inclusions", "included_product_id", "included_per_guests"])
    events = {
        row["id"]: row["event_id"] for row in bind.execute(sa.select(products.c.id, products.c.event_id)).mappings()
    }

    for batch in _batches(bind, products):
        for row in batch:

            def same_event(target, row=row):
                return target != row["id"] and events.get(target) == row["event_id"]

            stored = row["inclusions"]
            # A list always wins over the pair, as it did when both were set; a
            # missing (SQL or JSON null) or non-list value falls back to the pair.
            edges = (
                _clean_edges(stored, valid_target=same_event)
                if isinstance(stored, list)
                else _legacy_edges(row["included_product_id"], row["included_per_guests"], valid_target=same_event)
            )
            if edges != stored:
                bind.execute(products.update().where(products.c.id == row["id"]).values(inclusions=edges))

    def freeze(node):
        legacy = _legacy_edges(node.get("included_product_id"), node.get("included_per_guests"))
        inclusions = node["inclusions"] if isinstance(node.get("inclusions"), list) else legacy
        rules = {key: value for key, value in node.items() if key not in {"included_product_id", "included_per_guests"}}
        return {**rules, "inclusions": inclusions}

    _convert_frozen_packages(bind, registrations, lambda node: (new := freeze(node)) != node and new)

    op.alter_column("products", "inclusions", existing_type=sa.JSON(), nullable=False)
    op.drop_column("products", "included_per_guests")
    op.drop_column("products", "included_product_id")


def downgrade():
    op.add_column(
        "products",
        sa.Column("included_product_id", sa.String(64), sa.ForeignKey("products.id", ondelete="SET NULL")),
    )
    op.add_column("products", sa.Column("included_per_guests", sa.Integer()))
    op.alter_column("products", "inclusions", existing_type=sa.JSON(), nullable=True)

    bind = op.get_bind()
    products, registrations = _tables(bind, ["inclusions", "included_product_id", "included_per_guests"])
    events = {
        row["id"]: row["event_id"] for row in bind.execute(sa.select(products.c.id, products.c.event_id)).mappings()
    }
    for batch in _batches(bind, products):
        for row in batch:
            pair = _only_guest_pair(row["inclusions"])
            if pair and events.get(pair[0]) == row["event_id"] and pair[0] != row["id"]:
                bind.execute(
                    products.update()
                    .where(products.c.id == row["id"])
                    .values(inclusions=sa.null(), included_product_id=pair[0], included_per_guests=pair[1])
                )

    def unfreeze(node):
        pair = _only_guest_pair(node.get("inclusions"))
        if not pair:
            return None
        rules = {key: value for key, value in node.items() if key != "inclusions"}
        return {**rules, "inclusions": None, "included_product_id": pair[0], "included_per_guests": pair[1]}

    _convert_frozen_packages(bind, registrations, unfreeze)
