import { passwordRecoveryRequestSchema, passwordResetRequestSchema } from '@campusflow/contracts';
import { z } from 'zod';

export function recoveryFormSchema(reset: boolean) {
  return z.object({ email: z.string(), code: z.string(), newPassword: z.string(), confirmation: z.string() }).superRefine((values, context) => {
    const result = reset ? passwordResetRequestSchema.safeParse({ email: values.email, code: values.code, newPassword: values.newPassword })
      : passwordRecoveryRequestSchema.safeParse({ email: values.email });
    if (!result.success) for (const issue of result.error.issues) context.addIssue(issue);
    if (reset && values.newPassword !== values.confirmation) context.addIssue({ code: 'custom', path: ['confirmation'], message: 'The passwords must match.' });
  });
}
export type RecoveryFormValues = z.infer<ReturnType<typeof recoveryFormSchema>>;
