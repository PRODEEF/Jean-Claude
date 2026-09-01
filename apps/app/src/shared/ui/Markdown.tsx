import { useMemo } from "react";
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { fontSize, fontWeight, radius, spacing } from "@jc/design";
import {
  parseMarkdown,
  type InlineNode,
  type MarkdownBlock,
  type ListItem,
} from "@/shared/lib/markdown";
import { useTheme } from "@/shared/providers/theme-provider";

export type MarkdownProps = {
  children: string;
};

/**
 * Rendu d'une réponse Markdown.
 *
 * Réservé à la parole de l'assistant : le message de l'utilisateur est du texte
 * qu'il a tapé, l'interpréter ferait disparaître ses astérisques.
 */
export function Markdown({ children }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(children), [children]);

  return (
    <View style={styles.root}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </View>
  );
}

/** Taille et graisse d'un titre selon son niveau. */
const HEADING_SIZES = [fontSize.lg, fontSize.md, fontSize.md, fontSize.sm, fontSize.sm, fontSize.sm];

const MONOSPACE = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function Block({ block }: { block: MarkdownBlock }) {
  const { palette } = useTheme();

  switch (block.type) {
    case "heading": {
      const size = HEADING_SIZES[block.level - 1] ?? fontSize.sm;
      return (
        <Text
          accessibilityRole="header"
          style={[styles.heading, { fontSize: size, color: palette.text }]}
        >
          <Inline nodes={block.content} />
        </Text>
      );
    }

    case "paragraph":
      return (
        <Text style={[styles.paragraph, { color: palette.text }]}>
          <Inline nodes={block.content} />
        </Text>
      );

    case "rule":
      return <View style={[styles.rule, { backgroundColor: palette.border }]} />;

    case "codeBlock":
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.codeBlock, { backgroundColor: palette.surface }]}
        >
          <Text style={[styles.codeText, { color: palette.text }]}>{block.value}</Text>
        </ScrollView>
      );

    case "quote":
      return (
        <View style={[styles.quote, { borderLeftColor: palette.border }]}>
          {block.blocks.map((child, index) => (
            <Block key={index} block={child} />
          ))}
        </View>
      );

    case "list":
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <Item key={index} item={item} ordered={block.ordered} position={index + 1} />
          ))}
        </View>
      );

    case "table":
      return <Table header={block.header} rows={block.rows} />;
  }
}

function Item({
  item,
  ordered,
  position,
}: {
  item: ListItem;
  ordered: boolean;
  position: number;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.item}>
      <View style={styles.itemRow}>
        {/* Largeur fixe pour la puce : sans elle, « 10. » décalerait sa ligne
            par rapport à « 9. » et la colonne de texte ondulerait. */}
        <Text style={[styles.bullet, { color: palette.textMuted }]}>
          {ordered ? `${position}.` : "•"}
        </Text>
        <Text style={[styles.paragraph, styles.itemText, { color: palette.text }]}>
          <Inline nodes={item.content} />
        </Text>
      </View>

      {item.children.map((child, index) => (
        <View key={index} style={styles.nested}>
          <Block block={child} />
        </View>
      ))}
    </View>
  );
}

/**
 * Tableau.
 *
 * Défilement horizontal et colonnes de largeur fixe : sur un téléphone, un
 * tableau de 5 colonnes réparties en `flex` réduirait chacune à deux
 * caractères. Mieux vaut faire glisser que ne rien pouvoir lire.
 */
function Table({ header, rows }: { header: InlineNode[][]; rows: InlineNode[][][] }) {
  const { palette } = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.table}>
      <View style={{ borderColor: palette.border, borderWidth: 1, borderRadius: radius.sm }}>
        <View style={[styles.tableRow, { backgroundColor: palette.surface }]}>
          {header.map((cell, index) => (
            <Text key={index} style={[styles.tableCell, styles.tableHead, { color: palette.text }]}>
              <Inline nodes={cell} />
            </Text>
          ))}
        </View>

        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.tableRow, { borderTopColor: palette.border }]}>
            {row.map((cell, index) => (
              <Text key={index} style={[styles.tableCell, { color: palette.text }]}>
                <Inline nodes={cell} />
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  const { palette } = useTheme();

  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "text":
            return <Text key={index}>{node.value}</Text>;

          case "strong":
            return (
              <Text key={index} style={styles.strong}>
                <Inline nodes={node.children} />
              </Text>
            );

          case "emphasis":
            return (
              <Text key={index} style={styles.emphasis}>
                <Inline nodes={node.children} />
              </Text>
            );

          case "strike":
            return (
              <Text key={index} style={styles.strike}>
                <Inline nodes={node.children} />
              </Text>
            );

          case "code":
            return (
              <Text
                key={index}
                style={[styles.inlineCode, { backgroundColor: palette.surface }]}
              >
                {node.value}
              </Text>
            );

          case "link":
            return (
              <Text
                key={index}
                accessibilityRole="link"
                style={[styles.link, { color: palette.accent }]}
                // Erreur consignée et non remontée : un lien qu'aucune
                // application ne sait ouvrir ne doit pas interrompre la lecture
                // de la réponse.
                onPress={() => {
                  Linking.openURL(node.href).catch((error: unknown) => {
                    console.warn("Lien impossible à ouvrir", error);
                  });
                }}
              >
                <Inline nodes={node.children} />
              </Text>
            );
        }
      })}
    </>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  heading: { fontWeight: fontWeight.semibold, marginTop: spacing.xs },
  paragraph: { fontSize: fontSize.md, lineHeight: 22 },
  rule: { height: 1, marginVertical: spacing.xs },
  list: { gap: spacing.xs },
  item: { gap: spacing.xs },
  itemRow: { flexDirection: "row", gap: spacing.sm },
  bullet: { fontSize: fontSize.md, lineHeight: 22, minWidth: 22 },
  itemText: { flex: 1 },
  nested: { paddingLeft: spacing.lg },
  quote: { borderLeftWidth: 3, paddingLeft: spacing.md, gap: spacing.sm },
  codeBlock: { borderRadius: radius.sm, padding: spacing.md },
  codeText: { fontFamily: MONOSPACE, fontSize: fontSize.sm, lineHeight: 20 },
  inlineCode: { fontFamily: MONOSPACE, fontSize: fontSize.sm },
  strong: { fontWeight: fontWeight.semibold },
  emphasis: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  link: { textDecorationLine: "underline" },
  table: { marginVertical: spacing.xs },
  tableRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  tableCell: {
    width: 160,
    padding: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  tableHead: { fontWeight: fontWeight.semibold },
});
