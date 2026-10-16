import { z } from 'zod';

export const SheetSchema = z.object({
  studentNameRead: z.string().nullable(),
  versionCodeRead: z.string().nullable(),
  answers: z.array(
    z.object({
      q: z.number().int(),
      choice: z.enum(['A', 'B', 'C', 'D', 'E']).nullable(),
      text: z.string().nullable(),
      status: z.enum(['clear', 'blank', 'multiple', 'unclear']),
    }),
  ),
});

export type SheetSchemaType = z.infer<typeof SheetSchema>;
