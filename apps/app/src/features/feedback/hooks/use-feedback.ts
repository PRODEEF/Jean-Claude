import { useMutation } from "@tanstack/react-query";
import { Platform } from "react-native";
import { usePathname } from "expo-router";
import type { CreateFeedback, FeedbackPlatform, RateMessage } from "@jc/domain";
import { api } from "@/shared/lib/api";

/**
 * Contexte technique joint automatiquement à chaque feedback — jamais saisi
 * par l'utilisateur. Le desktop étant un wrapper du build web (CLAUDE.md),
 * `Platform.OS` ne rend ici que "web", "ios" ou "android".
 */
export function useFeedbackContext(): { platform: FeedbackPlatform; screen: string } {
  const screen = usePathname();
  return { platform: Platform.OS as FeedbackPlatform, screen };
}

export function useSubmitFeedback() {
  return useMutation({ mutationFn: (input: CreateFeedback) => api.feedback.submit(input) });
}

export function useRateMessage() {
  return useMutation({
    mutationFn: ({ messageId, ...input }: { messageId: string } & RateMessage) =>
      api.feedback.rateMessage(messageId, input),
  });
}
