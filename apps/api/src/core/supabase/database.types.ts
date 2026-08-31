/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Types de la base — FICHIER GÉNÉRÉ, NE PAS ÉDITER À LA MAIN.
 *
 * Ceci est un **stub permissif**, en place tant que le schéma n'a pas été
 * appliqué à une instance Supabase. Il laisse compiler les Repositories mais
 * ne vérifie AUCUN nom de colonne : une faute de frappe dans un `select` ou un
 * `insert` passera au travers du compilateur et n'échouera qu'à l'exécution.
 *
 * À remplacer dès que la base est disponible :
 *
 *     npm run db:types
 *
 * (soit `supabase gen types typescript --local`, ou `--project-id <ref>` pour
 * l'instance distante). Après génération, ce fichier décrit table par table
 * les formes `Row`, `Insert` et `Update`, et le typage devient réel.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/** Forme d'une table tant que les types réels ne sont pas générés. */
type UntypedTable = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: { [table: string]: UntypedTable };
    Views: { [view: string]: UntypedTable };
    Functions: { [fn: string]: { Args: Record<string, any>; Returns: any } };
    Enums: { [name: string]: string };
    CompositeTypes: { [name: string]: Record<string, any> };
  };
};
