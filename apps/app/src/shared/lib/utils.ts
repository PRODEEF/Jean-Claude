import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Fusionne des classes utilitaires en résolvant les conflits.
 *
 * Utilitaire attendu par les composants react-native-reusables : sans lui,
 * `className="p-2"` passé à un composant qui déclare déjà `p-4` produirait
 * deux classes contradictoires au lieu de la dernière.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
