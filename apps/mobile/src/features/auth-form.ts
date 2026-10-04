import { loginRequestSchema, registerRequestSchema } from '@campusflow/contracts';
import { z } from 'zod';

// Keep hidden registration fields in form state without requiring them at login.
export function authFormSchema(registering: boolean) {
  return z.object({
    email: z.string(),
    password: z.string(),
    displayName: z.string(),
    timeZone: z.string(),
  }).superRefine((values, context) => {
    const result = (registering ? registerRequestSchema : loginRequestSchema).safeParse(values);
    if (!result.success) {
      for (const issue of result.error.issues) context.addIssue(issue);
    }
  });
}

export type AuthFormValues = z.infer<ReturnType<typeof authFormSchema>>;
