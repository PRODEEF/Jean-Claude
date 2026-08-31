/**
 * @jc/domain — contrat métier partagé.
 *
 * Ce package est le seul endroit où sont définis les types et les règles de
 * validation du produit. Il est importé tel quel par l'API NestJS et par
 * l'application Expo (web / iOS / Android / desktop), ce qui garantit qu'un
 * changement de contrat casse la compilation des deux côtés plutôt que de
 * produire une divergence silencieuse.
 *
 * Règle : aucune dépendance à NestJS, à React, à Supabase ou à une API de
 * plateforme ici. Uniquement du TypeScript et Zod.
 */

export * from "./shared/primitives";
export * from "./shared/search.schema";
export * from "./auth/auth.schema";
export * from "./folder/folder.schema";
export * from "./conversation/conversation.schema";
export * from "./message/message.schema";
export * from "./task/task.schema";
export * from "./calendar/calendar.schema";
export * from "./assistant/assistant.schema";
export * from "./user/preferences.schema";
