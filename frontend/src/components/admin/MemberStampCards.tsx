import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/utils/apiErrors";
import {
  stampKeys,
  stampLabel,
  stampRequest,
  type StampCard,
  type StampReward,
} from "@/utils/stampCards";
import { queryKeys } from "@/utils/queryKeys";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import ConfirmModal from "@/components/ConfirmModal";

export default function MemberStampCards({
  person,
  authHeaders,
  onClose,
}: {
  person: { id: string; name: string };
  authHeaders: () => Record<string, string>;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const cards = useQuery({
    queryKey: stampKeys.cards(person.id),
    queryFn: ({ signal }) =>
      stampRequest<StampCard[]>(
        `/api/stamp-cards/people/${encodeURIComponent(person.id)}`,
        authHeaders,
        signal,
      ),
  });
  const [reward, setReward] = useState<StampReward | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !reward) onClose();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>{m.stamp_member_title({ name: person.name })}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {cards.isPending && <p role="status">{m.admin_loading()}</p>}
          {cards.isError && (
            <Alert variant="danger">
              {apiErrorMessage(cards.error, m.stamp_error())}
              <Button variant="outline" onClick={() => void cards.refetch()}>
                {m.admin_retry()}
              </Button>
            </Alert>
          )}
          {cards.data?.length === 0 && <p>{m.stamp_no_cards()}</p>}
          <div className="flex flex-col gap-4">
            {cards.data
              ?.slice()
              .reverse()
              .map((card) => (
                <section className="rounded border border-border p-4" key={card.id}>
                  <h3>{card.completed_at ? m.stamp_past_card() : m.stamp_current_card()}</h3>
                  <p>{m.stamp_progress({ count: card.stamps.length, total: card.box_count })}</p>
                  <p>{stampLabel(card)}</p>
                  <p className="text-sm text-subtle">
                    {m.stamp_opened({ date: new Date(card.opened_at).toLocaleDateString() })}
                  </p>
                  {card.reward && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={card.reward.handed_out_at ? "secondary" : "warning"}>
                        {card.reward.handed_out_at ? m.stamp_handed_out() : m.stamp_reward_due()}
                      </Badge>
                      <span className="text-sm">
                        {new Date(
                          card.reward.handed_out_at ?? card.reward.earned_at,
                        ).toLocaleDateString()}
                      </span>
                      <Button variant="outline" onClick={() => setReward(card.reward)}>
                        {card.reward.handed_out_at ? m.stamp_undo_hand_out() : m.stamp_hand_out()}
                      </Button>
                    </div>
                  )}
                </section>
              ))}
          </div>
        </DialogBody>
      </DialogContent>
      {reward && (
        <ConfirmModal
          show
          admin
          variant="primary"
          icon="exclamation-triangle"
          title={reward.handed_out_at ? m.stamp_undo_hand_out() : m.stamp_hand_out()}
          body={m.stamp_hand_out_confirm({ reward: stampLabel(reward), name: person.name })}
          confirmLabel={reward.handed_out_at ? m.stamp_undo_hand_out() : m.stamp_hand_out()}
          errorFallback={m.stamp_error()}
          onHide={() => setReward(null)}
          onConfirm={async () => {
            await stampRequest(
              `/api/stamp-cards/rewards/${encodeURIComponent(reward.id)}`,
              authHeaders,
              undefined,
              { handed_out: !reward.handed_out_at },
              "PUT",
            );
            await client.invalidateQueries({ queryKey: queryKeys.admin.people });
          }}
        />
      )}
    </Dialog>
  );
}
