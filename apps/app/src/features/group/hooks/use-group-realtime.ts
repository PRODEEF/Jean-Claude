import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { groupRealtimeTopic } from "@jc/domain";
import { supabase } from "@/shared/lib/supabase";
import { useAuth } from "@/shared/providers/auth-provider";
import { refreshGroup } from "./use-groups";

/*
 * Supabase Realtime, seule exception à l'invariant 3 : l'app s'y abonne pour
 * apprendre qu'il se passe quelque chose, jamais pour écrire en base. Le
 * contenu, lui, est toujours relu par l'API (docs/ARCHITECTURE.md).
 */

/** Une personne qui cesse de taper disparaît de l'indicateur après ce délai. */
const TYPING_TTL_MS = 4_000;
/** Un signal au plus par intervalle : taper une phrase n'émet pas un signal par touche. */
const TYPING_THROTTLE_MS = 2_500;

/**
 * Nouveaux messages de groupe, poussés par Realtime.
 *
 * Monté une fois dans la coquille et non dans la barre latérale : sur
 * téléphone, le tiroir est démonté tant qu'il est fermé, et les compteurs de
 * non-lus cesseraient d'avancer. La RLS filtre ce qui arrive : l'abonné ne
 * reçoit que les messages qu'il a le droit de lire. L'événement ne sert qu'à
 * invalider le cache ; le message est relu par l'API, avec ses règles.
 */
export function useGroupMessageFeed() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`messages:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          // Seul champ lu dans la ligne brute : de quoi savoir quel fil relire.
          const conversationId: unknown = payload.new["conversation_id"];
          if (typeof conversationId === "string") void refreshGroup(queryClient, conversationId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}

/**
 * Indicateur « en train d'écrire » d'un groupe.
 *
 * Canal `broadcast` privé : la policy de `realtime.messages` n'y laisse entrer
 * que les membres du groupe. Rien n'est écrit en base.
 */
export function useGroupTyping(groupId: string) {
  const { session } = useAuth();
  const selfId = session?.user.id ?? null;
  /** Personne qui écrit → instant où l'on cesse de l'afficher. */
  const [typing, setTyping] = useState<Record<string, number>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentAt = useRef(0);

  useEffect(() => {
    const channel = supabase
      .channel(groupRealtimeTopic(groupId), { config: { private: true } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const userId: unknown = (payload as { userId?: unknown } | undefined)?.userId;
        if (typeof userId !== "string") return;
        setTyping((current) => ({ ...current, [userId]: Date.now() + TYPING_TTL_MS }));
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      setTyping({});
      void supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Un seul minuteur, calé sur la prochaine expiration.
  useEffect(() => {
    const expiries = Object.values(typing);
    if (expiries.length === 0) return;

    const timer = setTimeout(
      () => {
        const now = Date.now();
        setTyping((current) =>
          Object.fromEntries(Object.entries(current).filter(([, expiry]) => expiry > now)),
        );
      },
      Math.max(0, Math.min(...expiries) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [typing]);

  const notifyTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!selfId || !channel) return;

    const now = Date.now();
    if (now - lastSentAt.current < TYPING_THROTTLE_MS) return;
    lastSentAt.current = now;
    void channel.send({ type: "broadcast", event: "typing", payload: { userId: selfId } });
  }, [selfId]);

  /** Le message de cette personne est arrivé : elle n'écrit plus. */
  const clearTyping = useCallback((userId: string) => {
    setTyping((current) => {
      if (!(userId in current)) return current;
      const { [userId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  return { typingUserIds: Object.keys(typing), notifyTyping, clearTyping };
}
