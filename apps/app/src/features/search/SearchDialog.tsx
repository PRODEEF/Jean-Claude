import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Search, X } from "lucide-react-native";
import type { Conversation, FolderTreeNode } from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { api } from "@/shared/lib/api";
import { useTheme } from "@/shared/providers/theme-provider";

export type SearchDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Ouvre la conversation retenue. */
  onSelect: (conversation: Conversation) => void;
};

const PANEL_WIDTH = 640;

/**
 * Recherche de conversation.
 *
 * Porte sur les titres, en mémoire : la liste des conversations est déjà en
 * cache pour la barre latérale, et les mêmes clés React Query sont réutilisées —
 * ouvrir la recherche ne déclenche donc aucun appel. Le jour où le contenu des
 * messages devra être fouillé, ce sera un point d'API, pas un filtre ici.
 */
export function SearchDialog({ open, onClose, onSelect }: SearchDialogProps) {
  const { palette } = useTheme();
  const window = useWindowDimensions();
  const [query, setQuery] = useState("");
  // Rangée sous le curseur du clavier. Les flèches la déplacent, Entrée
  // l'ouvre : sans elle, la recherche obligerait à lâcher le clavier pour
  // viser à la souris ce qu'on vient de taper.
  const [highlighted, setHighlighted] = useState(0);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations.list({ limit: 100 }),
    enabled: open,
  });

  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: () => api.folders.tree(),
    enabled: open,
  });

  /** Nom de dossier par identifiant — ce qui distingue deux titres identiques. */
  const folderNames = useMemo(() => {
    const names = new Map<string, string>();
    const walk = (node: FolderTreeNode) => {
      names.set(node.id, node.name);
      node.children.forEach(walk);
    };
    (folders.data ?? []).forEach(walk);
    return names;
  }, [folders.data]);

  const results = useMemo(() => {
    const items = conversations.data?.items ?? [];
    const needle = normalize(query);
    if (needle.length === 0) return items;
    return items.filter((item) => normalize(item.title).includes(needle));
  }, [conversations.data, query]);

  // Le curseur revient en tête à chaque frappe : la rangée qu'il désignait
  // n'est plus forcément dans les résultats.
  useEffect(() => setHighlighted(0), [query]);

  // La fenêtre reste montée entre deux ouvertures : sans cette remise à zéro,
  // elle rouvrirait sur la recherche précédente.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
    }
  }, [open]);

  if (!open) return null;

  const openHighlighted = () => {
    const conversation = results[highlighted];
    if (conversation) onSelect(conversation);
  };

  const move = (delta: number) => {
    if (results.length === 0) return;
    setHighlighted((current) => Math.min(results.length - 1, Math.max(0, current + delta)));
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      {/* Le voile est noir et non un jeton de la palette : un voile clair
          n'assombrirait rien en thème sombre. C'est aussi ce que fait le Dialog
          de shadcn. */}
      <Pressable
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer la recherche"
      />

      <View style={styles.centering} pointerEvents="box-none">
        <View
          style={[
            styles.panel,
            {
              width: Math.min(PANEL_WIDTH, window.width - spacing.xl),
              maxHeight: window.height * 0.65,
              backgroundColor: palette.surfaceElevated,
              borderColor: palette.border,
            },
          ]}
        >
          <View style={[styles.field, { borderBottomColor: palette.border }]}>
            <Search size={18} color={palette.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher une conversation"
              placeholderTextColor={palette.textMuted}
              accessibilityLabel="Rechercher une conversation"
              autoFocus
              returnKeyType="search"
              onSubmitEditing={openHighlighted}
              onKeyPress={(event) => {
                const key = event.nativeEvent.key;
                if (key === "ArrowDown") move(1);
                else if (key === "ArrowUp") move(-1);
                else if (key === "Escape") onClose();
              }}
              // Le cadre est porté par le panneau : le liseré de focus du
              // navigateur ferait un second trait à l'intérieur.
              className="web:outline-none"
              style={[styles.input, { color: palette.text }]}
            />
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fermer la recherche"
              style={styles.close}
            >
              <X size={18} color={palette.textMuted} />
            </Pressable>
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => (
              <ResultRow
                conversation={item}
                folderName={folderNames.get(item.folderIds[0] ?? "")}
                highlighted={index === highlighted}
                onHover={() => setHighlighted(index)}
                onPress={() => onSelect(item)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                  {conversations.isLoading
                    ? "Chargement…"
                    : query.trim().length === 0
                      ? "Aucune conversation pour l'instant."
                      : `Rien ne correspond à « ${query.trim()} ».`}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

function ResultRow({
  conversation,
  folderName,
  highlighted,
  onHover,
  onPress,
}: {
  conversation: Conversation;
  folderName: string | undefined;
  highlighted: boolean;
  onHover: () => void;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onHover}
      accessibilityRole="button"
      accessibilityLabel={conversation.title}
      style={[styles.row, highlighted ? { backgroundColor: palette.surface } : null]}
    >
      <MessageSquare size={16} color={highlighted ? palette.accent : palette.textMuted} />

      <View style={styles.rowText}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          {conversation.title}
        </Text>
        {/* Le dossier, faute de quoi deux conversations encore sans titre — donc
            toutes deux « Nouvelle conversation » — sont indiscernables. */}
        {folderName ? (
          <Text style={[styles.meta, { color: palette.textMuted }]} numberOfLines={1}>
            {folderName}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.meta, { color: palette.textMuted }]}>
        {relativeDate(conversation.lastMessageAt ?? conversation.updatedAt)}
      </Text>

      {/* Rappelle que la touche Entrée ouvre cette rangée-là. */}
      {highlighted ? (
        <Text style={[styles.enter, { color: palette.textMuted, borderColor: palette.border }]}>
          ⏎
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Minuscules et accents retirés.
 *
 * « Santé » doit se trouver en tapant « sante » : sans cela, la recherche
 * échoue sur la moitié des titres en français.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Ancienneté en langage courant.
 *
 * Une date complète sur chaque rangée serait du bruit : ce qu'on cherche à
 * savoir en parcourant une liste, c'est « récent » ou « ancien ».
 */
function relativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;

  if (date.toDateString() === now.toDateString()) return "Aujourd'hui";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Hier";

  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0, 0, 0, 0.5)" },
  // La fenêtre se pose au quart supérieur plutôt qu'au centre : c'est là que
  // l'œil part chercher un champ de recherche, et la liste a la place de
  // s'allonger vers le bas sans que le champ ne bouge.
  centering: { flex: 1, alignItems: "center", paddingTop: spacing.xxxl + spacing.xl },
  panel: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  input: { flex: 1, minHeight: MIN_TOUCH_TARGET + 12, fontSize: fontSize.md },
  close: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  rowText: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  meta: { fontSize: fontSize.xs },
  enter: {
    fontSize: fontSize.xs,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  empty: { padding: spacing.xl },
  emptyText: { fontSize: fontSize.sm, textAlign: "center" },
});
