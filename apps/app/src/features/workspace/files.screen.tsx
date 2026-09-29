import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FileText, Image as ImageIcon, Trash2 } from "lucide-react-native";
import type { FolderTreeNode, WorkspaceFile, WorkspaceMember } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { formatByteSize } from "@/features/conversation/AttachmentFileCard";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { formatRelativeTime } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/utils";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { READING_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";
import { useDeleteWorkspaceFile, useWorkspaceFiles } from "./hooks/use-workspace-files";
import { useWorkspaceFolders } from "./hooks/use-workspace-folders";
import { useWorkspaceMembers } from "./hooks/use-workspaces";

/**
 * Les fichiers envoyés dans les conversations de l'espace dont on est membre.
 *
 * Aucun rangement propre : un fichier suit les dossiers de sa conversation
 * (§13.4.1). Le filtre par dossier inclut ses sous-dossiers, comme le compteur
 * de la barre latérale.
 */
export function WorkspaceFilesScreen() {
  const { id: workspaceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const compact = useBreakpoint() === "compact";
  const [folderId, setFolderId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceFile | null>(null);

  const files = useWorkspaceFiles(workspaceId, folderId);
  const folders = useWorkspaceFolders(workspaceId);
  const members = useWorkspaceMembers(workspaceId);
  const names = useMemo(
    () => new Map((members.data ?? []).map((member) => [member.userId, memberName(member)])),
    [members.data],
  );
  const folderOptions = useMemo(() => flatten(folders.data ?? []), [folders.data]);
  const items = files.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <ScreenShell
      title="Fichiers"
      maxWidth={READING_MAX_WIDTH}
      onBack={compact ? () => router.back() : undefined}
    >
      {folderOptions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pb-4"
        >
          <FolderChip label="Tous" active={folderId === null} onPress={() => setFolderId(null)} />
          {folderOptions.map((folder) => (
            <FolderChip
              key={folder.id}
              label={folder.label}
              active={folderId === folder.id}
              onPress={() => setFolderId(folder.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      {files.isLoading ? (
        <ActivityIndicator color={palette.accent} className="py-10" />
      ) : files.error ? (
        // Message fixe, et non `error.message` : une erreur brute peut porter
        // des fragments de requête.
        <Text className="py-10 text-center text-sm text-destructive">
          Fichiers indisponibles pour le moment.
        </Text>
      ) : items.length === 0 ? (
        <Text className="py-10 text-center text-sm text-muted-foreground">
          {folderId
            ? "Aucun fichier dans les conversations de ce dossier."
            : "Aucun fichier pour l'instant. Ceux que vous joignez dans les conversations de l'espace apparaîtront ici."}
        </Text>
      ) : (
        <View>
          {items.map((file, index) => (
            <View key={file.id}>
              {index > 0 ? <Separator /> : null}
              <FileRow
                file={file}
                author={names.get(file.authorId) ?? "Ancien membre"}
                onOpen={() => {
                  // URL signée à courte durée de vie : ouverte aussitôt, jamais conservée.
                  Linking.openURL(file.url).catch((error: unknown) => {
                    console.warn("Fichier impossible à ouvrir", error);
                  });
                }}
                onOpenGroup={() => router.push(`/workspace/${workspaceId}/group/${file.groupId}`)}
                onDelete={() => setDeleting(file)}
              />
            </View>
          ))}
          {files.hasNextPage ? (
            <Button
              variant="ghost"
              onPress={() => void files.fetchNextPage()}
              disabled={files.isFetchingNextPage}
              className="mt-2"
            >
              <Text className="text-sm text-muted-foreground">Voir les fichiers plus anciens</Text>
            </Button>
          ) : null}
        </View>
      )}

      {deleting ? (
        <DeleteFileDialog
          workspaceId={workspaceId}
          file={deleting}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </ScreenShell>
  );
}

function FolderChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant={active ? "secondary" : "outline"}
      size="sm"
      onPress={onPress}
      accessibilityState={{ selected: active }}
      className="rounded-full"
    >
      <Text className={cn("text-sm", active ? "font-medium" : "text-muted-foreground")}>
        {label}
      </Text>
    </Button>
  );
}

function FileRow({
  file,
  author,
  onOpen,
  onOpenGroup,
  onDelete,
}: {
  file: WorkspaceFile;
  author: string;
  onOpen: () => void;
  onOpenGroup: () => void;
  onDelete: () => void;
}) {
  const image = file.mimeType.startsWith("image/");

  return (
    <View className="flex-row items-center gap-3 py-2">
      <Pressable
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={`Ouvrir ${file.fileName}`}
        className="min-w-0 flex-1 flex-row items-center gap-3"
        style={{ minHeight: MIN_TOUCH_TARGET }}
      >
        <View className="h-9 w-9 items-center justify-center rounded-md bg-muted">
          <Icon as={image ? ImageIcon : FileText} size={18} className="text-muted-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium" numberOfLines={1}>
            {file.fileName}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {author} · {formatRelativeTime(file.createdAt)} · {formatByteSize(file.byteSize)}
          </Text>
        </View>
      </Pressable>
      <Button
        variant="ghost"
        size="sm"
        onPress={onOpenGroup}
        accessibilityLabel={`Ouvrir la conversation ${file.groupTitle}`}
        className="max-w-[40%] px-2"
      >
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {file.groupTitle}
        </Text>
      </Button>
      {file.canDelete ? (
        <Button
          variant="ghost"
          size="icon"
          onPress={onDelete}
          accessibilityLabel={`Supprimer ${file.fileName}`}
        >
          <Icon as={Trash2} size={16} className="text-muted-foreground" />
        </Button>
      ) : null}
    </View>
  );
}

function DeleteFileDialog({
  workspaceId,
  file,
  onClose,
}: {
  workspaceId: string;
  file: WorkspaceFile;
  onClose: () => void;
}) {
  const remove = useDeleteWorkspaceFile(workspaceId);

  return (
    <Modal
      open
      onClose={onClose}
      variant="confirm"
      title={`Supprimer « ${file.fileName} » ?`}
      description={`Le fichier disparaît pour tous les membres. Le message de « ${file.groupTitle} » qui le portait indiquera « Fichier supprimé ».`}
      // Message fixe, et non `error.message` : une erreur remontée du serveur
      // peut porter des fragments de requête.
      error={remove.isError ? "La suppression a échoué. Réessayez dans un instant." : null}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: remove.isPending },
        {
          label: "Supprimer",
          variant: "destructive",
          disabled: remove.isPending,
          onPress: () => remove.mutate(file.id, { onSuccess: onClose }),
        },
      ]}
    />
  );
}

/** L'arborescence à plat, chaque sous-dossier précédé de ses parents. */
function flatten(nodes: FolderTreeNode[], parents: string[] = []): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: [...parents, node.name].join(" › ") },
    ...flatten(node.children, [...parents, node.name]),
  ]);
}

function memberName(member: WorkspaceMember): string {
  return member.displayName ?? member.email ?? "Ancien membre";
}
