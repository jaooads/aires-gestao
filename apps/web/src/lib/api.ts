import type { Session } from "@supabase/supabase-js";
import type {
  AdvanceProposalRequest,
  AdvanceProposalResponse,
  BootstrapResponse,
  ConfirmAdvanceResponse,
} from "@aires/shared";

const baseUrl = import.meta.env.VITE_API_URL ?? "";

type ApiErrorBody = { error?: { code?: string; message?: string } };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  session: Session,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      response.status,
      body.error?.code ?? "unknown_error",
      body.error?.message ?? "Não foi possível concluir a operação.",
    );
  }
  return (await response.json()) as T;
}

export const api = {
  bootstrap: (session: Session) => request<BootstrapResponse>("/api/bootstrap", session),
  createProposal: (session: Session, body: AdvanceProposalRequest) =>
    request<AdvanceProposalResponse>("/api/advance-proposals", session, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  confirmProposal: (session: Session, proposalId: string, idempotencyKey: string) =>
    request<ConfirmAdvanceResponse>(
      `/api/advance-proposals/${proposalId}/confirm`,
      session,
      { method: "POST", headers: { "idempotency-key": idempotencyKey } },
    ),
};

