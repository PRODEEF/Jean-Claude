import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Alert, Platform, type TextInput, type View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { messageAttachmentMimeTypeSchema } from "@jc/domain";

export type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  /** Ajoute le fichier à un envoi multipart — la forme diffère entre web et natif. */
  appendTo: (formData: FormData) => void;
};

const ACCEPTED_MIME_TYPES: readonly string[] = messageAttachmentMimeTypeSchema.options;

/**
 * Nœud DOM d'une référence React Native — web uniquement.
 *
 * Même patron que `features/navigation/sidebar-drag.ts` : `react-native-web`
 * rend une `View` ou un `TextInput` sous forme d'élément DOM et transmet la
 * référence telle quelle.
 */
function domNode<T>(ref: RefObject<T | null>): HTMLElement | null {
  if (Platform.OS !== "web") return null;
  return (ref.current as unknown as HTMLElement | null) ?? null;
}

function toPickedFilesWeb(files: File[]): PickedFile[] {
  return files
    .filter((file) => ACCEPTED_MIME_TYPES.includes(file.type))
    .map((file) => ({
      uri: URL.createObjectURL(file),
      name: file.name,
      mimeType: file.type,
      size: file.size,
      appendTo: (formData) => formData.append("file", file),
    }));
}

function toPickedFilesNative(assets: ImagePicker.ImagePickerAsset[]): PickedFile[] {
  return assets
    .filter((asset) => !asset.mimeType || ACCEPTED_MIME_TYPES.includes(asset.mimeType))
    .map((asset, index) => {
      const mimeType = asset.mimeType ?? "image/jpeg";
      const name = asset.fileName ?? `photo-${Date.now()}-${index}.${mimeType.split("/")[1] ?? "jpg"}`;

      return {
        uri: asset.uri,
        name,
        mimeType,
        size: asset.fileSize ?? 0,
        appendTo: (formData) => {
          // Convention React Native : `FormData` accepte un objet
          // `{ uri, name, type }` à la place d'un vrai `Blob`, que la
          // plateforme n'expose pas pour un fichier local.
          formData.append("file", { uri: asset.uri, name, type: mimeType } as unknown as Blob);
        },
      };
    });
}

/**
 * Sélection d'image.
 *
 * Web : sélecteur de fichier, glisser-déposer sur la coque du Composer,
 * collage d'une capture d'écran dans le champ — le geste le plus direct pour
 * "screens". Natif : galerie ou appareil photo, choisis via une alerte plutôt
 * qu'une feuille d'action dédiée (aucun composant de ce type n'existe encore
 * dans `shared/ui/`, une alerte suffit pour ce choix binaire).
 *
 * Un seul fichier plutôt qu'une extension `.web`/`.native` : à l'essai, cette
 * dernière casse le typage de `lucide-react-native` dans tout le projet dès
 * que `moduleSuffixes` est activé dans `tsconfig.json` (nécessaire pour que
 * `tsc` la résolve). L'écart de plateforme reste donc interne à ce fichier,
 * comme le redimensionnement du textarea dans `Composer.tsx`.
 */
export function useAttachmentPicker(
  onPick: (files: PickedFile[]) => void,
  textInputRef: RefObject<TextInput | null>,
): { pick: () => void; dropRef: RefObject<View | null>; isOver: boolean } {
  const latest = useRef(onPick);
  latest.current = onPick;

  const dropRef = useRef<View | null>(null);
  const [isOver, setIsOver] = useState(false);

  const pickWeb = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPTED_MIME_TYPES.join(",");
    input.multiple = true;
    input.onchange = () => {
      if (input.files) latest.current(toPickedFilesWeb(Array.from(input.files)));
    };
    input.click();
  }, []);

  useEffect(() => {
    const node = domNode(dropRef);
    if (!node) return;

    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Sans `preventDefault`, le navigateur refuse le dépôt.
      event.preventDefault();
      setIsOver(true);
    };
    const leave = () => setIsOver(false);
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setIsOver(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) latest.current(toPickedFilesWeb(files));
    };

    node.addEventListener("dragover", over);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);
    return () => {
      node.removeEventListener("dragover", over);
      node.removeEventListener("dragleave", leave);
      node.removeEventListener("drop", drop);
    };
  }, []);

  useEffect(() => {
    const node = domNode(textInputRef);
    if (!node) return;

    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        ACCEPTED_MIME_TYPES.includes(file.type),
      );
      if (files.length === 0) return;
      // Sans lui, le nom du fichier collé s'écrirait dans le champ à la
      // place de l'image.
      event.preventDefault();
      latest.current(toPickedFilesWeb(files));
    };

    node.addEventListener("paste", paste);
    return () => node.removeEventListener("paste", paste);
  }, [textInputRef]);

  const fromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photothèque indisponible",
        "Autorisez l'accès à vos photos dans les réglages pour joindre une image.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (!result.canceled) latest.current(toPickedFilesNative(result.assets));
  }, []);

  const fromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Appareil photo indisponible",
        "Autorisez l'accès à l'appareil photo dans les réglages pour prendre une photo.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!result.canceled) latest.current(toPickedFilesNative(result.assets));
  }, []);

  const pickNative = useCallback(() => {
    Alert.alert("Joindre une image", undefined, [
      { text: "Photothèque", onPress: () => void fromLibrary() },
      { text: "Appareil photo", onPress: () => void fromCamera() },
      { text: "Annuler", style: "cancel" },
    ]);
  }, [fromLibrary, fromCamera]);

  return { pick: Platform.OS === "web" ? pickWeb : pickNative, dropRef, isOver };
}
