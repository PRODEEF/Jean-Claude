import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedbackStatus } from "@jc/domain";
import { api } from "@/shared/lib/api";

const REVIEW_KEY = ["feedback-review"] as const;

/** Retours de tous les testeurs, regroupés par personne — réservé aux admins. */
export function useFeedbackReview(enabled: boolean) {
  return useQuery({
    queryKey: REVIEW_KEY,
    queryFn: () => api.feedback.review.list(),
    enabled,
  });
}

export function useUpdateFeedbackStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      api.feedback.review.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REVIEW_KEY }),
  });
}

/** Synthèse des nouveaux retours, à la demande : rien n'est conservé côté serveur. */
export function useAnalyzeNewFeedback() {
  return useMutation({ mutationFn: () => api.feedback.review.analyzeNew() });
}
