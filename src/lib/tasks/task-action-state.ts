export type TaskActionState = {
  error: string | null;
  successId: string | null;
};

export const initialTaskActionState: TaskActionState = { error: null, successId: null };
