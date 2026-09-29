import { Fragment } from "react";
import { ActivityIndicator, View } from "react-native";
import { ApiError } from "@jc/api-client";
import type {
  Feedback,
  FeedbackCategory,
  FeedbackStatus,
  MessageRating,
  TesterFeedback,
} from "@jc/domain";
import { useProfile } from "@/shared/hooks/use-profile";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Markdown } from "@/shared/ui/Markdown";
import { READING_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Select } from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";
import {
  useAnalyzeTester,
  useFeedbackReview,
  useUpdateFeedbackStatus,
} from "./hooks/use-feedback-review";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  idea: "Idée",
  other: "Réclamation ou autre",
};

const STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: "new", label: "Nouveau" },
  { value: "acknowledged", label: "Pris en compte" },
  { value: "resolved", label: "Traité" },
  { value: "dismissed", label: "Écarté" },
];

/**
 * Revue des retours testeurs, un testeur par carte.
 *
 * Réservée à l'équipe : l'entrée n'apparaît dans la barre latérale que pour
 * un admin, et le serveur refuse la lecture à tout autre compte. Le message
 * ci-dessous ne couvre que l'adresse tapée à la main.
 */
export function FeedbackReviewScreen() {
  const { palette } = useTheme();
  const { data: profile } = useProfile();
  const isAdmin = profile?.isAdmin === true;
  const review = useFeedbackReview(isAdmin);

  return (
    <ScreenShell title="Retours des testeurs" maxWidth={READING_MAX_WIDTH}>
      <View className="gap-6 pb-8">
        {profile && !isAdmin ? (
          <Text className="text-sm text-muted-foreground">Réservé à l'équipe Jean-Claude.</Text>
        ) : null}

        {review.isLoading ? <ActivityIndicator color={palette.accent} /> : null}

        {/* Message fixe, et non `error.message` : une erreur de fetch peut
            porter des fragments de requête. */}
        {review.error ? (
          <Text className="text-sm text-destructive">
            Les retours n'ont pas pu être chargés. Réessayez dans un instant.
          </Text>
        ) : null}

        {review.data && review.data.length === 0 ? (
          <Text className="text-sm text-muted-foreground">Aucun retour pour l'instant.</Text>
        ) : null}

        {review.data?.map((tester) => (
          <TesterCard key={tester.author.id} tester={tester} />
        ))}
      </View>
    </ScreenShell>
  );
}

function TesterCard({ tester }: { tester: TesterFeedback }) {
  const analyze = useAnalyzeTester();
  const { author } = tester;
  const name = author.displayName ?? author.email ?? "Compte supprimé";
  const open = tester.feedback.filter(
    (item) => item.status === "new" || item.status === "acknowledged",
  ).length;

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-3 px-1">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-semibold" role="heading" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {[
              author.displayName ? author.email : null,
              `${tester.feedback.length} retour(s), dont ${open} à traiter`,
              `actif le ${formatDate(tester.lastActivityAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <Button
          variant="outline"
          onPress={() => analyze.mutate(author.id)}
          disabled={analyze.isPending}
          accessibilityLabel={`Analyser les retours de ${name}`}
        >
          <Text>{analyze.isPending ? "Analyse en cours…" : "Analyser"}</Text>
        </Button>
      </View>

      {analyze.data ? (
        <View className="rounded-xl border border-border bg-muted px-4 py-3">
          <Markdown>{analyze.data.summary}</Markdown>
        </View>
      ) : null}

      {analyze.error ? (
        <Text className="px-1 text-sm text-destructive">{analysisErrorMessage(analyze.error)}</Text>
      ) : null}

      <View className="overflow-hidden rounded-xl border border-border bg-card">
        {tester.feedback.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 ? <Separator /> : null}
            <FeedbackRow item={item} />
          </Fragment>
        ))}

        {tester.ratings.length > 0 ? (
          <>
            {tester.feedback.length > 0 ? <Separator /> : null}
            <RatingsSummary ratings={tester.ratings} />
          </>
        ) : null}
      </View>
    </View>
  );
}

function FeedbackRow({ item }: { item: Feedback }) {
  const update = useUpdateFeedbackStatus();
  const settled = item.status === "resolved" || item.status === "dismissed";

  return (
    <View className="gap-2 px-4 py-3">
      <View className="flex-row flex-wrap items-center gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-sm font-medium">{CATEGORY_LABELS[item.category]}</Text>
          <Text className="text-xs text-muted-foreground">
            {formatDate(item.createdAt)} · {item.platform} · {item.screen}
          </Text>
        </View>
        <View style={{ minWidth: 160 }}>
          <Select
            value={item.status}
            options={STATUS_OPTIONS}
            onChange={(status) => update.mutate({ id: item.id, status })}
            placeholder="Statut"
            disabled={update.isPending}
            accessibilityLabel="Statut du retour"
          />
        </View>
      </View>

      {/* Un retour traité reste lisible, mais en retrait : l'œil va d'abord à
          ce qui attend. */}
      <Text className={settled ? "text-sm text-muted-foreground" : "text-sm"}>{item.content}</Text>

      {update.error ? (
        <Text className="text-xs text-destructive">
          Le statut n'a pas pu être enregistré. Réessayez.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Les notations sans commentaire ne disent que leur sens : comptées, pas
 * listées une à une.
 */
function RatingsSummary({ ratings }: { ratings: MessageRating[] }) {
  const up = ratings.filter((rating) => rating.rating === "up").length;
  const commented = ratings.filter((rating) => rating.comment !== null);

  return (
    <View className="gap-2 px-4 py-3">
      <Text className="text-sm font-medium">
        Réponses notées : {up} pouce(s) haut, {ratings.length - up} pouce(s) bas
      </Text>
      {commented.map((rating) => (
        <Text key={rating.id} className="text-sm">
          <Text className="text-sm text-muted-foreground">
            {`${rating.rating === "up" ? "Pouce haut" : "Pouce bas"}, le ${formatDate(rating.createdAt)} : `}
          </Text>
          {rating.comment}
        </Text>
      ))}
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Le serveur ne rend que des messages destinés à être lus (`httpError`). */
function analysisErrorMessage(cause: Error): string {
  if (cause instanceof ApiError) return cause.message;
  return "L'analyse a échoué. Réessayez dans un instant.";
}
