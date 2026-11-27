import type { Session } from "@supabase/supabase-js";
import type {
  AppSnapshotResponse,
  AdvanceProposalRequest,
  AdvanceProposalResponse,
  BootstrapResponse,
  ConfirmAdvanceResponse,
} from "@aires/shared";
import type { AppData, PayrollClosing, PayrollPreview, TimeEntry, TimeEntrySummary } from "../types";

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

export const authorizedRequest = <T>(
  path: string,
  session: Session,
  init?: RequestInit,
) => request<T>(path, session, init);

function toAppData(snapshot: AppSnapshotResponse): AppData {
  const projectName = new Map(snapshot.projects.map((project) => [project.id, project.name]));
  const workerName = new Map(snapshot.workers.map((worker) => [worker.id, worker.name]));
  const workers = snapshot.workers.map((worker) => ({
    ...worker,
    projects: worker.projectIds.map((id) => ({ id, name: projectName.get(id) ?? "Obra" })),
    advancesTotalCents: worker.pendingAdvanceCents,
    paymentsTotalCents: worker.paymentsTotalCents,
  }));
  const projects = snapshot.projects.map((project) => {
    const contracts = snapshot.contracts.filter((contract) => contract.projectId === project.id).map((contract) => ({
      ...contract,
      stages: snapshot.contractStages.filter((stage) => stage.contractId === contract.id),
    }));
    const projectWorkers = workers.filter((worker) => worker.projectIds.includes(project.id));
    return {
      id: project.id,
      name: project.name,
      client: project.client,
      address: project.address,
      status: project.status,
      active: project.status !== "completed",
      contractedCents: project.summary.contractedCents,
      receivedCents: project.summary.receivedCents,
      spentCents: project.summary.expensesCents + project.summary.laborCostCents,
      plannedCostCents: project.expectedCostCents,
      expectedProfitCents: project.summary.expectedProfitCents,
      realizedProfitCents: project.summary.realizedProfitCents,
      contracts,
      workers: projectWorkers,
    };
  });
  return {
    organization: snapshot.organization,
    role: snapshot.role,
    summary: snapshot.summary,
    projects,
    workers,
    ledger: snapshot.entries.map((entry) => ({
      id: entry.id,
      type: entry.type === "advance" ? "worker_advance" : entry.type,
      direction: entry.type === "receipt" ? "in" : "out",
      description: entry.description,
      amountCents: entry.amountCents,
      occurredOn: entry.occurredOn,
      projectId: entry.projectId,
      projectName: entry.projectId ? projectName.get(entry.projectId) ?? null : null,
      workerId: entry.workerId,
      workerName: entry.workerId ? workerName.get(entry.workerId) ?? null : null,
      status: "confirmed",
      createdAt: entry.createdAt,
    })),
    audit: [],
  };
}

export const api = {
  app: (session: Session) => request<AppSnapshotResponse>("/api/app", session).then(toAppData),
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
  createProject: (session: Session, body: unknown) => request("/api/projects", session, { method: "POST", body: JSON.stringify(body) }),
  updateProject: (session: Session, id: string, body: unknown) => request(`/api/projects/${id}`, session, { method: "PATCH", body: JSON.stringify(body) }),
  linkProjectWorker: (session: Session, projectId: string, body: unknown) => request(`/api/projects/${projectId}/workers`, session, { method: "POST", body: JSON.stringify(body) }),
  createContract: (session: Session, body: unknown) => request("/api/contracts", session, { method: "POST", body: JSON.stringify(body) }),
  createContractStage: (session: Session, body: unknown) => request("/api/contract-stages", session, { method: "POST", body: JSON.stringify(body) }),
  createWorker: (session: Session, body: unknown) => request("/api/workers", session, { method: "POST", body: JSON.stringify(body) }),
  updateWorker: (session: Session, id: string, body: unknown) => request(`/api/workers/${id}`, session, { method: "PATCH", body: JSON.stringify(body) }),
  createExpense: (session: Session, body: unknown, idempotencyKey: string) => request("/api/finance/expenses", session, { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify(body) }),
  createReceipt: (session: Session, body: unknown, idempotencyKey: string) => request("/api/finance/receipts", session, { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify(body) }),
  timeEntries: (session: Session, filters: { from: string; to: string; workerId?: string; projectId?: string }) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value)) as Array<[string, string]>);
    return request<{ entries: TimeEntry[]; summary: TimeEntrySummary }>(`/api/time-entries?${query}`, session);
  },
  createTimeEntries: (session: Session, entries: unknown[]) => request<{ entries: TimeEntry[] }>("/api/time-entries", session, { method: "POST", body: JSON.stringify({ entries }) }),
  updateTimeEntry: (session: Session, id: string, body: unknown) => request<TimeEntry>(`/api/time-entries/${id}`, session, { method: "PATCH", body: JSON.stringify(body) }),
  payrollClosings: (session: Session, filters?: { workerId?: string; status?: string; from?: string; to?: string }) => {
    const query = new URLSearchParams(Object.entries(filters ?? {}).filter(([, value]) => Boolean(value)) as Array<[string, string]>);
    return request<{ closures: PayrollClosing[] }>(`/api/payroll?${query}`, session);
  },
  previewPayroll: (session: Session, body: unknown) => request<PayrollPreview>("/api/payroll/preview", session, { method: "POST", body: JSON.stringify(body) }),
  createPayrollClosing: (session: Session, body: unknown) => request<PayrollClosing>("/api/payroll", session, { method: "POST", body: JSON.stringify(body) }),
  confirmPayrollClosing: (session: Session, id: string, idempotencyKey: string) => request<PayrollClosing>(`/api/payroll/${id}/confirm`, session, { method: "POST", headers: { "idempotency-key": idempotencyKey } }),
};

