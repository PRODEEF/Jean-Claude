import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ConnectMailAccount, MailAccount, MailInbox, MailMessageSummary } from "@jc/domain";
import { api } from "@/shared/lib/api";

const ACCOUNTS_KEY = ["mail", "accounts"] as const;

/** Les nouveaux mails arrivent seuls : la liste et les dossiers se rechargent chaque minute. */
const REFRESH_MS = 60_000;

/** Ce qu'on demande d'une liste : combien, quoi chercher, et les non lus seulement. */
export type MailListParams = { limit: number; q: string; unseen: boolean };

/** Les boîtes reliées ; vide tant qu'aucune ne l'est. */
export function useMailAccounts() {
  return useQuery({ queryKey: ACCOUNTS_KEY, queryFn: () => api.mail.accounts() });
}

export function useConnectMail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConnectMailAccount) => api.mail.connect(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mail"] }),
  });
}

export function useDisconnectMail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => api.mail.disconnect(accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mail"] }),
  });
}

/** Les dossiers d'une boîte, avec leurs non lus. */
export function useMailFolders(accountId: string) {
  return useQuery({
    queryKey: ["mail", "folders", accountId],
    queryFn: () => api.mail.folders(accountId),
    refetchInterval: REFRESH_MS,
  });
}

/** Les dossiers de toutes les boîtes, pour compter les non lus de « Tous les comptes ». */
export function useAllMailFolders(accounts: MailAccount[]) {
  return useQueries({
    queries: accounts.map((account) => ({
      queryKey: ["mail", "folders", account.id],
      queryFn: () => api.mail.folders(account.id),
      refetchInterval: REFRESH_MS,
    })),
  });
}

export function useMailMessages(
  accountId: string,
  folder: string,
  enabled: boolean,
  params: MailListParams,
) {
  return useQuery({
    queryKey: ["mail", "messages", accountId, folder, params],
    queryFn: () => api.mail.messages(accountId, folder, params),
    enabled,
    refetchInterval: REFRESH_MS,
    // Garde la liste à l'écran pendant qu'on en charge davantage ou qu'on affine
    // la recherche : elle ne se vide pas à chaque frappe.
    placeholderData: keepPreviousData,
  });
}

/** Les boîtes de réception de toutes les boîtes, réunies. */
export function useMailInbox(enabled: boolean, params: MailListParams) {
  return useQuery({
    queryKey: ["mail", "inbox", params],
    queryFn: () => api.mail.inbox(params),
    enabled,
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

/**
 * Le mail ouvert. Le serveur le marque lu en le lisant : les listes déjà à
 * l'écran le montrent aussitôt lu, sans attendre leur prochain rechargement, et
 * le compte de non lus du dossier est relu.
 */
export function useMailMessage(accountId: string | null, folder: string, uid: number | null) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["mail", "message", accountId, folder, uid],
    queryFn: async () => {
      const message = await api.mail.message(accountId as string, uid as number, folder);
      showSeen(queryClient, accountId as string, uid as number, true);
      void queryClient.invalidateQueries({ queryKey: ["mail", "folders", accountId] });
      return message;
    },
    enabled: accountId !== null && uid !== null,
  });
}

/** Marque un mail lu ou non lu, à l'écran d'abord puis chez le fournisseur. */
export function useSetMailSeen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { accountId: string; folder: string; uid: number; seen: boolean }) =>
      api.mail.setSeen(input.accountId, input.uid, input.seen, input.folder),
    onMutate: (input) => showSeen(queryClient, input.accountId, input.uid, input.seen),
    onSettled: (_data, _error, input) =>
      queryClient.invalidateQueries({ queryKey: ["mail", "folders", input.accountId] }),
  });
}

/** Reporte l'état lu d'un mail dans toutes les listes déjà chargées. */
function showSeen(
  queryClient: ReturnType<typeof useQueryClient>,
  accountId: string,
  uid: number,
  seen: boolean,
): void {
  const mark = (message: MailMessageSummary) =>
    message.accountId === accountId && message.uid === uid ? { ...message, seen } : message;

  queryClient.setQueriesData<MailMessageSummary[]>(
    { queryKey: ["mail", "messages", accountId] },
    (messages) => messages?.map(mark),
  );
  queryClient.setQueriesData<MailInbox>({ queryKey: ["mail", "inbox"] }, (inbox) =>
    inbox ? { ...inbox, messages: inbox.messages.map(mark) } : inbox,
  );
}
