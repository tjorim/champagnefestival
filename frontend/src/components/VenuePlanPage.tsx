import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { m } from "@/paraglide/messages";
import { fetchVenuePlan } from "@/utils/venuePlanApi";

export default function VenuePlanPage() {
  const auth = useAuth();
  const { edition, table } = useSearch({ from: "/admin-layout/venue-plan" });
  const authHeaders = (): Record<string, string> => {
    const token = auth.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const query = useQuery({
    queryKey: ["venue-plan", edition],
    queryFn: () => fetchVenuePlan(edition!, authHeaders),
    enabled: Boolean(edition && (auth.hasRole("admin") || auth.hasRole("volunteer"))),
    retry: false,
  });

  if (!edition) return <Alert variant="warning">{m.venue_plan_missing_edition()}</Alert>;
  if (query.isLoading)
    return (
      <div className="text-center p-5">
        <Spinner />
      </div>
    );
  if (query.isError) return <Alert variant="danger">{query.error.message}</Alert>;
  if (!query.data?.layouts.length) return <Alert variant="info">{m.venue_plan_empty()}</Alert>;

  return (
    <div className="container py-3">
      <p className="text-secondary">{m.venue_plan_description()}</p>
      {query.data.layouts.map((layout) => (
        <Card bg="dark" text="white" className="mb-4" key={layout.id}>
          <Card.Header className="d-flex justify-content-between">
            <strong>{layout.room?.name ?? layout.label}</strong>
            {layout.date && <Badge bg="secondary">{layout.date}</Badge>}
          </Card.Header>
          <Card.Body>
            <div
              className="position-relative border rounded overflow-hidden"
              style={{
                width: "100%",
                aspectRatio: `${layout.room?.width_m ?? 4} / ${layout.room?.length_m ?? 3}`,
                minHeight: 280,
                borderColor: layout.room?.color,
                background:
                  "repeating-linear-gradient(0deg,transparent,transparent 31px,rgba(255,255,255,.05) 32px)",
              }}
              aria-label={layout.room?.name ?? layout.label}
            >
              {layout.areas.map((area) => (
                <div
                  key={area.id}
                  className="position-absolute text-secondary small"
                  style={{
                    left: `${area.x}%`,
                    top: `${area.y}%`,
                    transform: `rotate(${area.rotation}deg)`,
                  }}
                >
                  <i className={`bi ${area.icon} me-1`} aria-hidden="true" />
                  {area.label}
                </div>
              ))}
              {layout.tables.map((item) => {
                const selected = item.id === table;
                const occupied = item.occupied_seats;
                const occupancyClass =
                  occupied > item.capacity
                    ? "border-danger bg-danger bg-opacity-10 text-danger"
                    : occupied === item.capacity
                      ? "border-warning bg-warning bg-opacity-10 text-warning"
                      : occupied
                        ? "border-success bg-dark text-success"
                        : "border-secondary bg-dark text-light";
                return (
                  <div
                    key={item.id}
                    className={`position-absolute border rounded px-2 py-1 text-center ${selected ? "border-warning bg-warning text-dark" : occupancyClass}`}
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                      minWidth: 72,
                    }}
                    title={`${item.name}: ${occupied}/${item.capacity}`}
                    aria-current={selected ? "location" : undefined}
                  >
                    <div className="fw-semibold small">{item.name}</div>
                    <div className="small">
                      <i className="bi bi-people-fill me-1" />
                      {occupied}/{item.capacity}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card.Body>
        </Card>
      ))}
    </div>
  );
}
