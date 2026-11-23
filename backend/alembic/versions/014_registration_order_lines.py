"""Move booked order lines to indexed relational rows.

Downgrade restores the canonical JSON representation, including package rules.
Malformed legacy entries discarded or repaired at upgrade are not recoverable.
"""

from decimal import Decimal, DecimalException

import sqlalchemy as sa

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None

LINE_FIELDS = {"product_id", "name", "name_nl", "name_fr", "name_en", "price", "category", "unit"}
MAX_COUNT = 2**63 - 1
MAX_PRICE = Decimal("99999999.99")
BATCH_SIZE = 500


def _text(*values):
    for value in values:
        if isinstance(value, str):
            cleaned = value.replace("\x00", "").encode("utf-8", "replace").decode("utf-8")
            if cleaned.strip():
                return cleaned
    return None


def _count(value, maximum=MAX_COUNT):
    try:
        count = Decimal(str(value))
        return int(max(0, min(maximum, count))) if count.is_finite() else 0
    except DecimalException, ValueError:
        return 0


def _price(*values):
    for value in values:
        try:
            price = Decimal(str(value))
            if price.is_finite() and 0 <= price <= MAX_PRICE:
                return price.quantize(Decimal("0.01"))
        except DecimalException, ValueError:
            continue
    return Decimal(0)


def _flag(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, (str, int)):
        if str(value).lower() in {"1", "true", "yes"}:
            return True
        if str(value).lower() in {"0", "false", "no"}:
            return False
    return default


def _object(value):
    return value if isinstance(value, dict) else {}


def _array(value):
    return value if isinstance(value, list) else []


def _package_node(node):
    # Older snapshots used active for the same flag. Rebuild malformed edges so
    # subsequent booking edits only see usable package quantities and rounding.
    edges = node.get("inclusions")
    included_product_id = _text(node.get("included_product_id"))
    included_per_guests = _count(node.get("included_per_guests"))
    if edges is not None:
        clean_edges = {}
        for raw_edge in _array(edges):
            edge = _object(raw_edge)
            target = _text(edge.get("product_id"))
            quantity = _count(edge.get("quantity"))
            per_quantity = _count(edge.get("per_quantity", 1))
            if target and quantity and per_quantity:
                clean_edges.setdefault(
                    target,
                    {
                        "product_id": target,
                        "quantity": quantity,
                        "per_quantity": per_quantity,
                        "rounding": "up" if edge.get("rounding") == "up" else "down",
                    },
                )
        edges = list(clean_edges.values())
    if not included_product_id or not included_per_guests:
        included_product_id = included_per_guests = None
    return {
        "purchasable": _flag(node.get("purchasable"), _flag(node.get("active"), True)),
        "required": _flag(node.get("required")),
        "inclusions": edges,
        "included_product_id": included_product_id,
        "included_per_guests": included_per_guests,
    }


def _registration_batches(bind, registrations):
    last_id = None
    while True:
        query = sa.select(registrations).order_by(registrations.c.id).limit(BATCH_SIZE)
        if last_id is not None:
            query = query.where(registrations.c.id > last_id)
        batch = bind.execute(query).mappings().all()
        if not batch:
            return
        yield batch
        last_id = batch[-1]["id"]


def _booked_fields(item, node, product, product_id):
    return {
        "name_nl": _text(
            item.get("name_nl"),
            item.get("name"),
            node.get("name_nl"),
            node.get("name"),
            product.get("name_nl"),
            product_id,
        ),
        "name_fr": _text(item.get("name_fr"), node.get("name_fr")),
        "name_en": _text(item.get("name_en"), node.get("name_en")),
        "price": _price(item.get("price"), node.get("price")),
        "category": _text(item.get("category"), node.get("category"), product.get("category"), "unknown"),
        "unit": _text(item.get("unit"), node.get("unit"), product.get("unit"), "item"),
    }


def upgrade():
    op.create_table(
        "registration_order_lines",
        sa.Column(
            "registration_id", sa.String(64), sa.ForeignKey("registrations.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("position", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Text(), nullable=False),
        sa.Column("live_product_id", sa.String(64), sa.ForeignKey("products.id", ondelete="SET NULL")),
        sa.Column("name_nl", sa.Text(), nullable=False),
        sa.Column("name_fr", sa.Text()),
        sa.Column("name_en", sa.Text()),
        sa.Column("quantity", sa.BigInteger(), nullable=False),
        sa.Column("included_quantity", sa.BigInteger(), nullable=False),
        sa.Column("delivered_quantity", sa.BigInteger(), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column("visible", sa.Boolean(), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_order_line_quantity"),
        sa.CheckConstraint("included_quantity BETWEEN 0 AND quantity", name="ck_order_line_included"),
        sa.CheckConstraint("delivered_quantity BETWEEN 0 AND quantity", name="ck_order_line_delivered"),
        sa.CheckConstraint("price >= 0", name="ck_order_line_price"),
        sa.CheckConstraint("live_product_id = product_id", name="ck_order_line_product_identity"),
    )
    op.create_index("ix_registration_order_lines_live_product_id", "registration_order_lines", ["live_product_id"])
    op.add_column("registrations", sa.Column("package_snapshot", sa.JSON(), nullable=False, server_default="{}"))

    bind = op.get_bind()
    metadata = sa.MetaData()
    registrations = sa.Table(
        "registrations",
        metadata,
        autoload_with=bind,
        resolve_fks=False,
        include_columns=["id", "event_id", "order_items", "product_snapshot", "package_snapshot"],
    )
    lines = sa.Table("registration_order_lines", metadata, autoload_with=bind, resolve_fks=False)
    products = sa.Table(
        "products",
        metadata,
        autoload_with=bind,
        resolve_fks=False,
        include_columns=["id", "event_id", "name_nl", "category", "unit"],
    )
    catalog = {p["id"]: p for p in bind.execute(sa.select(products)).mappings()}
    for batch in _registration_batches(bind, registrations):
        new_lines = []
        for row in batch:
            old_graph = {
                key: node
                for raw_key, node in _object(row["product_snapshot"]).items()
                if (key := _text(raw_key)) and isinstance(node, dict)
            }
            booked_ids = set()
            position = 0
            for raw_item in _array(row["order_items"]):
                item = _object(raw_item)
                product_id = _text(item.get("product_id"))
                quantity = _count(item.get("quantity"))
                if not product_id or not quantity:
                    continue
                product = catalog.get(product_id)
                if product and product["event_id"] != row["event_id"]:
                    product = None
                delivered = item.get("delivered_quantity")
                new_lines.append(
                    {
                        "registration_id": row["id"],
                        "position": position,
                        "product_id": product_id,
                        "live_product_id": product_id if product else None,
                        **_booked_fields(item, old_graph.get(product_id, {}), product or {}, product_id),
                        "quantity": quantity,
                        "included_quantity": _count(item.get("included_quantity"), quantity),
                        "delivered_quantity": (
                            _count(delivered, quantity)
                            if delivered is not None
                            else quantity
                            if _flag(item.get("delivered"))
                            else 0
                        ),
                        "visible": _flag(item.get("visible"), True),
                    }
                )
                position += 1
                booked_ids.add(product_id)

            graph = {}
            for key, old_node in old_graph.items():
                node = _package_node(old_node)
                if key not in booked_ids:
                    fields = _booked_fields({}, old_node, {}, key)
                    node.update(fields, name=fields["name_nl"], price=str(fields["price"]), product_id=key)
                graph[key] = node
            if graph:
                bind.execute(
                    registrations.update().where(registrations.c.id == row["id"]).values(package_snapshot=graph)
                )
        if new_lines:
            bind.execute(lines.insert(), new_lines)

    op.alter_column("registrations", "package_snapshot", server_default=None)
    op.drop_column("registrations", "order_items")
    op.drop_column("registrations", "product_snapshot")


def downgrade():
    op.add_column(
        "registrations", sa.Column("order_items", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb"))
    )
    op.add_column("registrations", sa.Column("product_snapshot", sa.JSON(), nullable=False, server_default="{}"))

    bind = op.get_bind()
    metadata = sa.MetaData()
    registrations = sa.Table(
        "registrations",
        metadata,
        autoload_with=bind,
        resolve_fks=False,
        include_columns=["id", "package_snapshot", "order_items", "product_snapshot"],
    )
    lines = sa.Table("registration_order_lines", metadata, autoload_with=bind, resolve_fks=False)
    for batch in _registration_batches(bind, registrations):
        by_registration = {}
        for line in bind.execute(
            sa.select(lines)
            .where(lines.c.registration_id.in_([row["id"] for row in batch]))
            .order_by(lines.c.registration_id, lines.c.position)
        ).mappings():
            item = {
                key: value
                for key, value in line.items()
                if key not in {"registration_id", "position", "live_product_id"}
            }
            item.update(
                name=line["name_nl"],
                price=float(line["price"]),
                delivered=line["delivered_quantity"] == line["quantity"],
            )
            by_registration.setdefault(line["registration_id"], []).append(item)
        for row in batch:
            items = by_registration.get(row["id"], [])
            graph = row["package_snapshot"]
            for item in items:
                fields = {key: item[key] for key in LINE_FIELDS}
                fields["price"] = f"{item['price']:.2f}"
                rules = graph.get(item["product_id"])
                if rules is not None:
                    rules.update(fields)
                del item["unit"]
            bind.execute(
                registrations.update()
                .where(registrations.c.id == row["id"])
                .values(order_items=items, product_snapshot=graph)
            )

    op.drop_column("registrations", "package_snapshot")
    op.drop_table("registration_order_lines")
