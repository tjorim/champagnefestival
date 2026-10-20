import { AdminEmptyState } from "./AdminEmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/paraglide/messages";
import type { PollOrders } from "@/utils/adminContentApi";
import { exportToCsv } from "@/utils/csvExport";
import { pollCountsSummary, type PollQuestionKind } from "@/utils/pollKinds";

type Volunteer = PollOrders["volunteers"][number];

interface Column {
  key: string;
  header: string;
  cell: (volunteer: Volunteer) => string;
}

function answerText(volunteer: Volunteer, questionId: string): string {
  const answer = volunteer.attendance[questionId];
  if (!answer) return "";
  return answer.attending
    ? `${m.poll_answer_yes()} (${m.admin_poll_orders_people({ count: answer.people })})`
    : m.poll_answer_no();
}

type Question = PollOrders["questions"][number];

const COLUMNS: Record<PollQuestionKind, (question: Question) => Column[]> = {
  yes_no: (question) => [
    {
      key: question.id,
      header: question.title,
      cell: (volunteer) => answerText(volunteer, question.id),
    },
  ],
  meals: (question) =>
    question.options.map((option) => ({
      key: option.id,
      header: `${question.title}: ${option.label}`,
      cell: (volunteer) =>
        volunteer.quantities[option.id] ? String(volunteer.quantities[option.id]) : "",
    })),
};

/** The columns of every question, each kind showing its answers its own way. */
function columnsFor(orders: PollOrders): Column[] {
  return orders.questions.flatMap((question) => COLUMNS[question.kind](question));
}

interface PollOrdersTableProps {
  editionId: string;
  orders: PollOrders;
  onEdit: (volunteerId: string) => void;
}

/** Who answered what: the answers per volunteer, who has not answered yet, and a CSV export. */
export default function PollOrdersTable({ editionId, orders, onEdit }: PollOrdersTableProps) {
  const columns = columnsFor(orders);

  function exportCsv() {
    exportToCsv(
      `volunteer-poll-${editionId}.csv`,
      orders.volunteers.map((volunteer) => ({
        [m.admin_poll_orders_volunteer()]: volunteer.name,
        ...Object.fromEntries(columns.map((column) => [column.header, column.cell(volunteer)])),
        [m.admin_poll_orders_note()]: volunteer.note ?? "",
      })),
    );
  }

  if (orders.volunteers.length === 0) {
    return <AdminEmptyState>{m.admin_poll_orders_no_volunteers()}</AdminEmptyState>;
  }

  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <ul className="list-none p-0 m-0 text-sm text-subtle">
          {orders.questions.map((question) => (
            <li key={question.id}>
              {question.title}:{" "}
              {m.admin_poll_orders_answered({
                answered: question.answeredCount,
                total: orders.volunteerCount,
              })}
              {pollCountsSummary(question.kind, question) &&
                ` — ${pollCountsSummary(question.kind, question)}`}
            </li>
          ))}
        </ul>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          {m.admin_poll_orders_export()}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.admin_poll_orders_volunteer()}</TableHead>
            {columns.map((column) => (
              <TableHead key={column.key}>{column.header}</TableHead>
            ))}
            <TableHead>{m.admin_poll_orders_note()}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.volunteers.map((volunteer) => (
            <TableRow key={volunteer.volunteerId}>
              <TableCell>
                {volunteer.name}
                {volunteer.answeredQuestionIds.length === 0 && (
                  <Badge variant="secondary" className="ms-2">
                    {m.admin_poll_orders_none()}
                  </Badge>
                )}
              </TableCell>
              {columns.map((column) => (
                <TableCell key={column.key}>{column.cell(volunteer)}</TableCell>
              ))}
              <TableCell>{volunteer.note ?? ""}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline" onClick={() => onEdit(volunteer.volunteerId)}>
                  {volunteer.answeredQuestionIds.length > 0
                    ? m.admin_poll_orders_edit()
                    : m.admin_poll_orders_enter()}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
