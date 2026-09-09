import { extractText, getDocumentProxy } from "unpdf";
import { logger } from "./logger.js";

const SCOPE = "core.pdf-text";

/**
 * Extrait le texte d'un PDF pour l'injecter comme contenu textuel au modèle
 * (§13.4.1) — jamais de lecture native par le fournisseur IA, contournant
 * ainsi l'instabilité documentée des « file content parts » du Gateway.
 *
 * `null` si le PDF ne contient aucun texte exploitable : corrompu, protégé,
 * ou scanné sans couche de texte. Ce dernier cas est hors périmètre pour
 * cette itération — pas d'OCR — et se traduit par un refus explicite à
 * l'upload plutôt qu'un contenu silencieusement vide envoyé au modèle.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (error) {
    logger.warn(SCOPE, "Échec de l'extraction de texte du PDF", error instanceof Error ? error.message : error);
    return null;
  }
}
