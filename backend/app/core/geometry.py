"""Floor-plan geometry rules shared by the schemas and the services."""


def normalise_table_type_dimensions(shape: str, width_m: float, length_m: float) -> tuple[float, float]:
    """Return canonical (width_m, length_m) for a table type.

    - round tables have a single diameter: the larger of the two inputs, so
      whichever field the caller actually used to express it (only one is
      meaningful for a circle) is preserved rather than always deferring to
      width_m — previously this silently discarded length_m, which could
      collapse a large-capacity round table down to a tiny default diameter
      (see #835).
    - rectangular tables ensure length_m >= width_m by swapping if needed
    Shared between TableTypeCreate validator and table_types_service update path
    so the two entry points cannot diverge.
    """
    if shape == "round":
        diameter = max(width_m, length_m)
        return diameter, diameter
    if length_m < width_m:
        return length_m, width_m
    return width_m, length_m
