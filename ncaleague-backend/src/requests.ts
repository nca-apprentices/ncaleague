import { z } from 'zod';

// The request bodies the API accepts. Anything else answers 400.
export const newPlayerBody = z.object({ name: z.string().trim().min(1).max(50) });

// The locations and modes match the database's enum types.
const newGameBody = z.object({
  players: z
    .array(z.string())
    .length(4)
    .refine((names) => new Set(names.map((name) => name.toLowerCase())).size === names.length, 'Players repeat'),
  location: z.enum(['Zurich', 'Winterthur']),
  mode: z.enum(['4-5', '3-5', '1-10']),
});

const nextMatchBody = z.object({ gameId: z.string() });

export const newMatchBody = z.union([nextMatchBody, newGameBody]);

export const goalBody = z.object({ scoringPlayer: z.string() });
