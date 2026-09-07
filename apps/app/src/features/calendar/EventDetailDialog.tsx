import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react-native";
import type { CalendarEvent } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Modal } from "@/shared/ui/modal";
import { useCalendarActions } from "./hooks/use-calendar-events";
import { formatFullDay, formatTime } from "@/shared/lib/dates";

export type EventDetailDialogProps = {
  /** `null` = fenêtre fermée. */
  event: CalendarEvent | null;
  onClose: () => void;
  /** Ouvre le formulaire de modification complet — un pas de plus, jamais le premier. */
  onEdit: (event: CalendarEvent) => void;
};

/**
 * Détail d'un événement au clic sur le calendrier, avant tout formulaire de
 * modification — même geste que Google Calendar (§4.2) : le premier écran
 * montre ce que porte l'événement, la modification se demande à part.
 */
export function EventDetailDialog({ event, onClose, onEdit }: EventDetailDialogProps) {
  if (!event) return null;
  return <Detail key={event.id} event={event} onClose={onClose} onEdit={onEdit} />;
}

function Detail({
  event,
  onClose,
  onEdit,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const { remove } = useCalendarActions();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (confirmingDelete) {
    return (
      <Modal
        open
        onClose={onClose}
        variant="confirm"
        title={`Supprimer « ${event.title} » ?`}
        description="Cette suppression est définitive."
        error={error}
        actions={[
          { label: "Annuler", onPress: () => setConfirmingDelete(false), disabled: remove.isPending },
          {
            label: "Supprimer",
            variant: "destructive",
            disabled: remove.isPending,
            onPress: () =>
              remove.mutate(event.id, {
                onSuccess: onClose,
                onError: (cause) => setError(toMessage(cause)),
              }),
          },
        ]}
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      variant="confirm"
      title={event.title}
      description={describeEvent(event)}
      headerActions={[
        {
          icon: Trash2,
          label: "Supprimer l'événement",
          destructive: true,
          onPress: () => setConfirmingDelete(true),
        },
        { icon: Pencil, label: "Modifier l'événement", onPress: () => onEdit(event) },
      ]}
      actions={[{ label: "Fermer", onPress: onClose }]}
    />
  );
}

/** Date, horaire et notes réunis dans la description — la modale reste une simple lecture. */
function describeEvent(event: CalendarEvent): string {
  const day = formatFullDay(new Date(event.startsAt));
  const when = event.allDay
    ? `${day} · journée entière`
    : `${day} · ${formatTime(event.startsAt)}${event.endsAt ? `–${formatTime(event.endsAt)}` : ""}`;

  return event.notes ? `${when}\n\n${event.notes}` : when;
}

/**
 * Un 400 vient de nos propres règles et porte un message écrit pour
 * l'utilisateur. Tout le reste est remplacé : une panne technique peut
 * transporter des fragments de requête.
 */
function toMessage(cause: Error): string {
  if (cause instanceof ApiError && cause.status === 400) return cause.message;
  return "La suppression a échoué. Réessayez dans un instant.";
}
