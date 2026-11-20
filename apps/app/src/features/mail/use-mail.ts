import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConnectMailAccount, MailAccount } from "@jc/domain";
import { api } from "@/shared/lib/api";

const ACCOUNTS_KEY = ["mail", "accounts"] as const;

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
  });
}

/** Les dossiers de toutes les boîtes, pour compter les non lus de « Tous les comptes ». */
export function useAllMailFolders(accounts: MailAccount[]) {
  return useQueries({
    queries: accounts.map((account) => ({
      queryKey: ["mail", "folders", account.id],
      queryFn: () => api.mail.folders(account.id),
    })),
  });
}

export function useMailMessages(accountId: string, folder: string, enabled: boolean) {
  return useQuery({
    queryKey: ["mail", "messages", accountId, folder],
    queryFn: () => api.mail.messages(accountId, folder),
    enabled,
  });
}

/** Les boîtes de réception de toutes les boîtes, réunies. */
export function useMailInbox(enabled: boolean) {
  return useQuery({
    queryKey: ["mail", "inbox"],
    queryFn: () => api.mail.inbox(),
    enabled,
  });
}

export function useMailMessage(accountId: string | null, folder: string, uid: number | null) {
  return useQuery({
    queryKey: ["mail", "message", accountId, folder, uid],
    queryFn: () => api.mail.message(accountId as string, uid as number, folder),
    enabled: accountId !== null && uid !== null,
  });
}
