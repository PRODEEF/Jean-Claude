import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConnectMailAccount } from "@jc/domain";
import { api } from "@/shared/lib/api";

const ACCOUNT_KEY = ["mail", "account"] as const;

/** `null` tant qu'aucune boîte n'est reliée. */
export function useMailAccount() {
  return useQuery({ queryKey: ACCOUNT_KEY, queryFn: () => api.mail.account() });
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
    mutationFn: () => api.mail.disconnect(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mail"] }),
  });
}

export function useMailFolders() {
  return useQuery({ queryKey: ["mail", "folders"], queryFn: () => api.mail.folders() });
}

export function useMailMessages(folder: string) {
  return useQuery({
    queryKey: ["mail", "messages", folder],
    queryFn: () => api.mail.messages(folder),
  });
}

export function useMailMessage(folder: string, uid: number | null) {
  return useQuery({
    queryKey: ["mail", "message", folder, uid],
    queryFn: () => api.mail.message(uid as number, folder),
    enabled: uid !== null,
  });
}
