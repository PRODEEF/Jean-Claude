import { useRef, useState } from "react";
import { type LayoutChangeEvent, PanResponder, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { radius, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";
import { Input } from "@/shared/ui/input";

export type ColorPickerProps = {
  value: string;
  onChange: (hex: string) => void;
};

type Hsv = { h: number; s: number; v: number };
type Rgb = { r: number; g: number; b: number };

const DEFAULT_SIZE = 220;
const HUE_HEIGHT = 20;
const THUMB_SIZE = 18;

/**
 * Sélecteur de couleur libre : carré teinte/saturation, curseur de teinte et
 * champ hexadécimal.
 *
 * Écrit avec `react-native-svg`, déjà tiré par les icônes Lucide : les
 * dégradés qu'il demande ne s'expriment pas dans les styles React Native.
 *
 * Contrôlé, mais avec un état de teinte/saturation/luminosité propre : un
 * aller-retour permanent par l'hexadécimal perdrait la teinte dès que la
 * saturation ou la luminosité touche 0, où elle devient indéterminée.
 */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const { palette } = useTheme();
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(value) ?? DEFAULT_RGB));
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());

  // Le glissé sur le carré ou la bande de teinte pousse ici à chaque image :
  // l'aperçu (pastille, champ hexadécimal) suit en temps réel, sans appeler
  // `onChange`, qui enverrait sinon une requête par pixel parcouru.
  const preview = (next: Hsv) => {
    setHsv(next);
    setHexDraft(rgbToHex(hsvToRgb(next)));
  };

  // Validé au relâchement du geste ou à la sortie du champ hexadécimal.
  const commit = (next: Hsv) => {
    preview(next);
    onChange(rgbToHex(hsvToRgb(next)));
  };

  const submitHex = () => {
    const rgb = hexToRgb(hexDraft);
    if (!rgb) {
      setHexDraft(rgbToHex(hsvToRgb(hsv)));
      return;
    }
    commit(rgbToHsv(rgb));
  };

  return (
    <View style={styles.root}>
      <SaturationValuePad
        hue={hsv.h}
        saturation={hsv.s}
        value={hsv.v}
        onDrag={(s, v) => preview({ ...hsv, s, v })}
        onCommit={() => commit(hsv)}
      />

      <HueSlider hue={hsv.h} onDrag={(h) => preview({ ...hsv, h })} onCommit={() => commit(hsv)} />

      <View style={styles.hexRow}>
        <View
          style={[styles.swatch, { backgroundColor: hexDraft, borderColor: palette.border }]}
        />
        <Input
          value={hexDraft}
          onChangeText={setHexDraft}
          onSubmitEditing={submitHex}
          onBlur={submitHex}
          placeholder="#RRGGBB"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          accessibilityLabel="Couleur au format hexadécimal"
          className="flex-1"
        />
      </View>
    </View>
  );
}

/** Carré teinte/saturation à la teinte courante : blanc → teinte pure, transparent → noir. */
function SaturationValuePad({
  hue,
  saturation,
  value,
  onDrag,
  onCommit,
}: {
  hue: number;
  saturation: number;
  value: number;
  onDrag: (saturation: number, value: number) => void;
  onCommit: () => void;
}) {
  const { palette } = useTheme();
  const [size, setSize] = useState<number | null>(null);

  // Le `PanResponder` n'est construit qu'une fois (`useRef`, ci-dessous) :
  // ses callbacks ne doivent donc jamais fermer directement sur `size`,
  // `onDrag` ou `onCommit` du rendu courant, sous peine de rejouer
  // indéfiniment ceux du tout premier rendu. Cette référence, mutée à chaque
  // rendu mais jamais recréée, est le seul canal qui reste à jour pour eux —
  // même principe que la poignée de la barre latérale (`AppSidebar.tsx`).
  const latest = useRef({ size, onDrag, onCommit });
  latest.current = { size, onDrag, onCommit };

  const fromGesture = (locationX: number, locationY: number) => {
    const current = latest.current;
    if (current.size === null) return;
    current.onDrag(clamp01(locationX / current.size), clamp01(1 - locationY / current.size));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) =>
        fromGesture(event.nativeEvent.locationX, event.nativeEvent.locationY),
      onPanResponderMove: (event) =>
        fromGesture(event.nativeEvent.locationX, event.nativeEvent.locationY),
      onPanResponderRelease: () => latest.current.onCommit(),
      onPanResponderTerminate: () => latest.current.onCommit(),
    }),
  ).current;

  const onLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout.width);
  const hueColor = rgbToHex(hsvToRgb({ h: hue, s: 1, v: 1 }));

  return (
    <View
      onLayout={onLayout}
      {...responder.panHandlers}
      style={[styles.pad, { borderColor: palette.border }]}
      accessibilityRole="adjustable"
      accessibilityLabel="Saturation et luminosité de la couleur"
    >
      {size === null ? null : (
        <>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="saturation" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="1" stopColor={hueColor} />
              </LinearGradient>
              <LinearGradient id="brightness" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#000000" stopOpacity={1} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width={size} height={size} fill="url(#saturation)" />
            <Rect width={size} height={size} fill="url(#brightness)" />
          </Svg>

          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                left: saturation * size - THUMB_SIZE / 2,
                top: (1 - value) * size - THUMB_SIZE / 2,
                backgroundColor: rgbToHex(hsvToRgb({ h: hue, s: saturation, v: value })),
              },
            ]}
          />
        </>
      )}
    </View>
  );
}

/** Bande de teinte, du rouge au rouge en passant par les six couleurs pures. */
function HueSlider({
  hue,
  onDrag,
  onCommit,
}: {
  hue: number;
  onDrag: (hue: number) => void;
  onCommit: () => void;
}) {
  const { palette } = useTheme();
  const [width, setWidth] = useState<number | null>(null);

  // Même raison que sur le carré teinte/saturation : le `PanResponder` figé
  // au premier rendu ne doit lire `width`, `onDrag` et `onCommit` qu'à
  // travers cette référence, jamais directement.
  const latest = useRef({ width, onDrag, onCommit });
  latest.current = { width, onDrag, onCommit };

  const fromGesture = (locationX: number) => {
    const current = latest.current;
    if (current.width === null) return;
    current.onDrag(clamp01(locationX / current.width) * 360);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => fromGesture(event.nativeEvent.locationX),
      onPanResponderMove: (event) => fromGesture(event.nativeEvent.locationX),
      onPanResponderRelease: () => latest.current.onCommit(),
      onPanResponderTerminate: () => latest.current.onCommit(),
    }),
  ).current;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      {...responder.panHandlers}
      style={[styles.hueTrack, { borderColor: palette.border }]}
      accessibilityRole="adjustable"
      accessibilityLabel="Teinte de la couleur"
    >
      {width === null ? null : (
        <>
          <Svg width={width} height={HUE_HEIGHT} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
                {HUE_STOPS.map(([offset, color]) => (
                  <Stop key={offset} offset={offset} stopColor={color} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect width={width} height={HUE_HEIGHT} rx={HUE_HEIGHT / 2} fill="url(#hue)" />
          </Svg>

          <View
            pointerEvents="none"
            style={[
              styles.hueThumb,
              {
                left: (hue / 360) * width - THUMB_SIZE / 2,
                backgroundColor: rgbToHex(hsvToRgb({ h: hue, s: 1, v: 1 })),
              },
            ]}
          />
        </>
      )}
    </View>
  );
}

const HUE_STOPS: readonly [number, string][] = [
  [0, "#FF0000"],
  [1 / 6, "#FFFF00"],
  [2 / 6, "#00FF00"],
  [3 / 6, "#00FFFF"],
  [4 / 6, "#0000FF"],
  [5 / 6, "#FF00FF"],
  [1, "#FF0000"],
];

const DEFAULT_RGB: Rgb = { r: 99, g: 102, b: 241 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function hexToRgb(hex: string): Rgb | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

const styles = StyleSheet.create({
  root: { gap: spacing.md, maxWidth: DEFAULT_SIZE },
  pad: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.4)",
  },
  hueTrack: {
    width: "100%",
    height: HUE_HEIGHT,
    borderRadius: HUE_HEIGHT / 2,
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "center",
  },
  hueThumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.4)",
  },
  hexRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
