import type { MailAccount } from "@jc/domain";
import { forUser } from "../../core/supabase/supabase.js";
import type { IMailRepository, StoredMailAccount } from "./mail.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type MailAccountRow = {
  id: string;
  address: string;
  host: string;
  password_encrypted: string;
  created_at: string;
};

const COLUMNS = "id, address, host, password_encrypted, created_at";

function toAccount(row: MailAccountRow): MailAccount {
  return { id: row.id, address: row.address, host: row.host, createdAt: row.created_at };
}

function toStored(row: MailAccountRow): StoredMailAccount {
  return { ...toAccount(row), passwordEncrypted: row.password_encrypted };
}

export const mailRepository: IMailRepository = {
  async list(userId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("mail_accounts")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as MailAccountRow[]).map(toStored);
  },

  async findById(userId, id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("mail_accounts")
      .select(COLUMNS)
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toStored(data as MailAccountRow) : null;
  },

  async save(userId, input, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("mail_accounts")
      .upsert(
        {
          user_id: userId,
          address: input.address,
          host: input.host,
          password_encrypted: input.passwordEncrypted,
        },
        { onConflict: "user_id,address" },
      )
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toAccount(data as MailAccountRow);
  },

  async remove(userId, id, accessToken) {
    const { error } = await forUser(accessToken)
      .from("mail_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
