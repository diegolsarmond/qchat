export type CredentialRecord = {
  id: string;
  user_id: string | null;
  [key: string]: unknown;
};

export type GuardResult<T extends CredentialRecord> =
  | { response: Response; credential?: undefined }
  | { response?: undefined; credential: T };

export function ensureCredentialOwnership<T extends CredentialRecord>(
  credential: T | null,
  userId: string | null,
  corsHeaders: Record<string, string>,
): GuardResult<T> {
  if (!credential) {
    return {
      response: new Response(
        JSON.stringify({ error: "Credential not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      ),
    };
  }

  if (credential.user_id === null) {
    return { credential };
  }

  if (userId && credential.user_id === userId) {
    return { credential };
  }

  if (!userId) {
    return {
      response: new Response(
        JSON.stringify({ error: "Acesso não autorizado" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      ),
    };
  }

  return {
    response: new Response(
      JSON.stringify({ error: "Acesso não autorizado" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    ),
  };
}
