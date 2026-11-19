export type CreateServiceRequestState = {
  error: string | null;
  successId: string | null;
};

export type RequestWorkflowActionState = {
  error: string | null;
  success: string | null;
  requestId: string | null;
};

export const initialRequestWorkflowActionState: RequestWorkflowActionState = {
  error: null,
  success: null,
  requestId: null,
};
