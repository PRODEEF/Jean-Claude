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
import type { Conversation, DateShortcut, FolderTreeNode, SearchFilters } from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { api } from "@/shared/lib/api";
import { useTheme } from "@/shared/providers/theme-provider";

export type SearchDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Ouvre la conversation retenue. */
  onSelect: (conversation: Conversation) => void;
};

/**
 * Largeur de la fenêtre de recherche.
 *
 * Assez large pour que les sept raccourcis de période tiennent en deux rangées
 * et que les titres de conversation ne se tronquent pas au troisième mot.
 */
const PANEL_WIDTH = 780;

/**
 * Délai avant d'interroger le serveur, en millisecondes.
 *
 * La recherche part sur la frappe et non sur la validation — c'est ce qu'on
 * attend d'un champ de recherche moderne. Sans ce délai, taper « mutuelle »
 * déclencherait huit recherches plein texte pour n'en afficher qu'une.
 */
const TYPING_DELAY = 250;

/**
 * Raccourcis de période (A.6). L'ordre va du plus court au plus long : c'est
 * dans les jours récents qu'on cherche le plus souvent.
 */
const DATE_SHORTCUTS: { value: DateShortcut; label: string }[] = [
  { value: "this_week", label: "Cette semaine" },
  { value: "last_week", label: "La semaine dernière" },
  { value: "this_month", label: "Ce mois-ci" },
  { value: "last_month", label: "Le mois dernier" },
  { value: "this_year", label: "Cette année" },
  { value: "last_year", label: "L'année dernière" },
];

/**
 * Recherche de conversation par filtres (A.6).
 *
 * Le mot-clé porte sur les titres **et** sur le contenu des messages : c'est
 * le serveur qui cherche, via les index plein texte français. Les périodes,
 * elles, sont résolues côté serveur dans le fuseau de l'utilisateur — « le
 * mois dernier » ne peut pas se calculer sur quatre plateformes différentes
 * sans risquer quatre résultats différents.
 */
export function SearchDialog({ open, onClose, onSelect }: SearchDialogProps) {
  const { palette } = useTheme();
  const window = useWindowDimensions();

  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("");
  const [shortcut, setShortcut] = useState<DateShortcut | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  // Rangée sous le curseur du clavier. Les flèches la déplacent, Entrée
  // l'ouvre : sans elle, la recherche obligerait à lâcher le clavier pour
  // viser à la souris ce qu'on vient de taper.
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(query.trim()), TYPING_DELAY);
    return () => clearTimeout(timer);
  }, [query]);

  const filters = useMemo((): Partial<SearchFilters> => {
    const fromDate = toCalendarDate(from);
    const toDate = toCalendarDate(to);
    return {
      ...(keyword.length > 0 ? { query: keyword } : {}),
      ...(shortcut ? { shortcut } : {}),
      ...(fromDate ? { from: fromDate } : {}),
      ...(toDate ? { to: toDate } : {}),
      ...(folderIds.length > 0 ? { folderIds } : {}),
      ...(includeArchived ? { includeArchived: true } : {}),
    };
  }, [keyword, shortcut, from, to, folderIds, includeArchived]);

  const hasFilters = Object.keys(filters).length > 0;

  const search = useQuery({
    queryKey: ["search", filters],
    queryFn: () => api.search.conversations(filters),
    enabled: open,
    // La liste précédente reste affichée pendant la frappe suivante : sans
    // cela, chaque lettre viderait la fenêtre puis la remplirait.
    placeholderData: (previous) => previous,
  });

  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: () => api.folders.tree(),
    enabled: open,
  });

  /** Dossiers à plat, dans l'ordre de l'arborescence. */
  const flatFolders = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const walk = (node: FolderTreeNode) => {
      list.push({ id: node.id, name: node.name });
      node.children.forEach(walk);
    };
    (folders.data ?? []).forEach(walk);
    return list;
  }, [folders.data]);

  /** Nom de dossier par identifiant — ce qui distingue deux titres identiques. */
  const folderNames = useMemo(
    () => new Map(flatFolders.map((folder) => [folder.id, folder.name])),
    [flatFolders],
  );

  const results = search.data?.items ?? [];

  // Le curseur revient en tête à chaque changement de recherche : la rangée
  // qu'il désignait n'est plus forcément dans les résultats.
  useEffect(() => setHighlighted(0), [filters]);

  // La fenêtre reste montée entre deux ouvertures : sans cette remise à zéro,
  // elle rouvrirait sur la recherche précédente.
  useEffect(() => {
    if (open) {
      setQuery("");
      setKeyword("");
      setShortcut(null);
      setDatesOpen(false);
      setFrom("");
      setTo("");
      setFolderIds([]);
      setIncludeArchived(false);
      setHighlighted(0);
    }
  }, [open]);

  if (!open) return null;

  const openHighlighted = () => {
    const result = results[highlighted];
    if (result) onSelect(result.conversation);
  };

  const move = (delta: number) => {
    if (results.length === 0) return;
    setHighlighted((current) => Math.min(results.length - 1, Math.max(0, current + delta)));
  };

  const toggleFolder = (id: string) =>
    setFolderIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  /** Période et dates saisies s'excluent : le serveur ignorerait les secondes. */
  const pickShortcut = (value: DateShortcut) => {
    setShortcut((current) => (current === value ? null : value));
    setFrom("");
    setTo("");
    setDatesOpen(false);
  };

  const openDates = () => {
    setDatesOpen((current) => !current);
    setShortcut(null);
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
              maxHeight: window.height * 0.8,
              backgroundColor: palette.surfaceElevated,
              borderColor: palette.border,
            },
          ]}
        >
          <View style={styles.field}>
            <Search size={18} color={palette.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher dans les conversations"
              placeholderTextColor={palette.textMuted}
              accessibilityLabel="Rechercher dans les conversations"
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

          <ChipRow>
            {DATE_SHORTCUTS.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                active={shortcut === option.value}
                onPress={() => pickShortcut(option.value)}
              />
            ))}
            <FilterChip label="Dates précises" active={datesOpen} onPress={openDates} />
          </ChipRow>

          {datesOpen ? (
            <View style={styles.dates}>
              <DateField label="Du" value={from} onChange={setFrom} />
              <DateField label="Au" value={to} onChange={setTo} />
            </View>
          ) : null}

          {flatFolders.length > 0 || includeArchived ? (
            <ChipRow>
              <FilterChip
                label="Archivées"
                active={includeArchived}
                onPress={() => setIncludeArchived((current) => !current)}
              />
              {flatFolders.map((folder) => (
                <FilterChip
                  key={folder.id}
                  label={folder.name}
                  active={folderIds.includes(folder.id)}
                  onPress={() => toggleFolder(folder.id)}
                />
              ))}
            </ChipRow>
          ) : null}

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <FlatList
            data={results}
            keyExtractor={(item) => item.conversation.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => (
              <ResultRow
                conversation={item.conversation}
                excerpt={item.excerpt}
                folderName={folderNames.get(item.conversation.folderIds[0] ?? "")}
                highlighted={index === highlighted}
                onHover={() => setHighlighted(index)}
                onPress={() => onSelect(item.conversation)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                  {search.isPending
                    ? "Chargement…"
                    : search.isError
                      ? "La recherche a échoué."
                      : hasFilters
                        ? "Rien ne correspond à cette recherche."
                        : "Aucune conversation pour l'instant."}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

/**
 * Les filtres passent à la ligne plutôt que de défiler latéralement : un
 * raccourci de période sorti du cadre ne se devine pas, et personne ne pousse
 * une rangée de pastilles à la souris pour vérifier ce qu'elle cache.
 */
function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      // La pastille mesure 32 pt pour que deux rangées de filtres ne mangent
      // pas la liste de résultats ; le débord de 6 pt lui rend la cible
      // tactile de 44 pt.
      hitSlop={{ top: 6, bottom: 6 }}
      style={[
        styles.chip,
        {
          borderColor: active ? palette.accent : palette.border,
          backgroundColor: active ? palette.accentSoft : "transparent",
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.chipText, { color: active ? palette.accentSoftText : palette.textMuted }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.dateField}>
      <Text style={[styles.dateLabel, { color: palette.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => onChange(formatDateInput(next))}
        placeholder="JJ/MM/AAAA"
        placeholderTextColor={palette.textMuted}
        accessibilityLabel={`${label} — date au format jour, mois, année`}
        keyboardType="number-pad"
        maxLength={10}
        className="web:outline-none"
        style={[styles.dateInput, { color: palette.text, borderColor: palette.border }]}
      />
    </View>
  );
}

function ResultRow({
  conversation,
  excerpt,
  folderName,
  highlighted,
  onHover,
  onPress,
}: {
  conversation: Conversation;
  excerpt: string | null;
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
        {/* L'extrait dit pourquoi la conversation remonte ; à défaut le dossier,
            faute de quoi deux conversations encore sans titre — donc toutes deux
            « Nouvelle conversation » — sont indiscernables. */}
        {excerpt ? (
          <Text style={[styles.meta, { color: palette.textMuted }]} numberOfLines={2}>
            {excerpt}
          </Text>
        ) : folderName ? (
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

/** Pose les séparateurs à mesure de la frappe : « 03092026 » devient « 03/09/2026 ». */
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter((part) => part.length > 0)
    .join("/");
}

/**
 * « 03/09/2026 » vers la date de calendrier attendue par l'API.
 *
 * Rend `undefined` tant que la saisie est incomplète ou impossible : le filtre
 * ne part alors pas, plutôt que de renvoyer une erreur de validation à chaque
 * chiffre tapé.
 */
function toCalendarDate(input: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (!match) return undefined;

  const [, day, month, year] = match;
  if (!day || !month || !year) return undefined;

  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  // Postgres refuserait un 31 février ; le mois roulerait silencieusement.
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day)) return undefined;

  return `${year}-${month}-${day}`;
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
    // `boxShadow` plutôt que les `shadow*` + `elevation` d'autrefois : ces
    // derniers sont dépréciés par react-native-web, et la nouvelle
    // architecture rend `boxShadow` sur les trois plateformes.
    boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.24)",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  input: { flex: 1, minHeight: MIN_TOUCH_TARGET + 12, fontSize: fontSize.md },
  close: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  chip: {
    height: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  dates: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  dateField: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dateLabel: { fontSize: fontSize.xs },
  dateInput: {
    width: 120,
    height: 32,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    fontSize: fontSize.xs,
  },
  divider: { height: 1 },
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
