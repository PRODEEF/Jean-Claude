import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { X } from "lucide-react-native";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import {
  formatDateInput,
  formatTimeInput,
  parseDateInput,
  parseTimeInput,
} from "@/shared/lib/date-input";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

export type DateTimeFieldProps = {
  mode: "date" | "time";
  /** `JJ/MM/AAAA` ou `HH:MM` — la forme que les formulaires tiennent déjà. Vide si rien n'est choisi. */
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
  /** Affiché tant que rien n'est choisi. */
  placeholder?: string;
  /** Le champ peut-il être vidé ? Oui pour une échéance ou un filtre, non pour la date d'un événement. */
  clearable?: boolean;
};

/**
 * Sélecteur de date ou d'heure, version iOS et Android.
 *
 * Le sélecteur natif de chaque système plutôt qu'une grille dessinée ici :
 * c'est celui qu'utilisent le Calendrier iOS et Google Calendar (§4.2), et
 * l'utilisateur le connaît déjà. La version web vit dans
 * `date-time-field.web.tsx`.
 *
 * Android ouvre la boîte de dialogue du système ; iOS déplie le sélecteur sous
 * le champ, refermé par « Terminé ».
 */
export function DateTimeField({
  mode,
  value,
  onChange,
  accessibilityLabel,
  placeholder,
  clearable = false,
}: DateTimeFieldProps) {
  const { palette, scheme } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const current = toDate(mode, value);

  const commit = (date: Date) =>
    onChange(mode === "date" ? formatDateInput(date) : formatTimeInput(date));

  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        is24Hour: true,
        onChange: (event, date) => {
          if (event.type === "set" && date) commit(date);
        },
      });
      return;
    }
    // Ouvrir sans rien choisir doit déjà remplir le champ : le sélecteur iOS
    // affiche une valeur, le champ ne peut pas prétendre rester vide.
    if (!value) commit(current);
    setIosOpen(true);
  };

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={value ? `${accessibilityLabel} : ${value}` : accessibilityLabel}
          style={[
            styles.field,
            { borderColor: palette.border, backgroundColor: palette.background },
          ]}
        >
          <Text style={[styles.text, { color: value ? palette.text : palette.textMuted }]}>
            {value || placeholder || ""}
          </Text>
        </Pressable>
        {clearable && value ? (
          <Button
            variant="ghost"
            size="icon"
            onPress={() => {
              setIosOpen(false);
              onChange("");
            }}
            accessibilityLabel={`Effacer — ${accessibilityLabel}`}
          >
            <Icon as={X} size={16} className="text-muted-foreground" />
          </Button>
        ) : null}
      </View>

      {iosOpen ? (
        <View>
          <DateTimePicker
            value={current}
            mode={mode}
            display={mode === "date" ? "inline" : "spinner"}
            locale="fr-FR"
            themeVariant={scheme}
            accentColor={palette.accent}
            onChange={(_event, date) => {
              if (date) commit(date);
            }}
          />
          <Pressable
            onPress={() => setIosOpen(false)}
            accessibilityRole="button"
            style={styles.done}
          >
            <Text style={[styles.doneText, { color: palette.accent }]}>Terminé</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * La valeur du champ en `Date`, ou un point de départ raisonnable quand il est
 * vide : aujourd'hui pour une date, 9 h pour une heure.
 */
function toDate(mode: "date" | "time", value: string): Date {
  if (mode === "date") {
    const day = parseDateInput(value);
    return day instanceof Date ? day : new Date();
  }

  const time = parseTimeInput(value) ?? { hours: 9, minutes: 0 };
  const date = new Date();
  date.setHours(time.hours, time.minutes, 0, 0);
  return date;
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  field: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  text: { fontFamily: FONT_FAMILY, fontSize: fontSize.md },
  done: { minHeight: MIN_TOUCH_TARGET, alignItems: "flex-end", justifyContent: "center" },
  doneText: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, fontWeight: "600" },
});
