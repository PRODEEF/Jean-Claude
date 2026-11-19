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

export function useMailMessages(enabled: boolean) {
  return useQuery({
    queryKey: ["mail", "messages"],
    queryFn: () => api.mail.messages(),
    enabled,
  });
}

export function useMailMessage(uid: number | null) {
  return useQuery({
    queryKey: ["mail", "message", uid],
    queryFn: () => api.mail.message(uid as number),
    enabled: uid !== null,
  });
}
