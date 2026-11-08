import { z } from "zod";
export const settingsSchema = z
  .object({
    cardsPerKind: z.union([z.literal(3), z.literal(4), z.literal(5)]),
    events: z.boolean(),
    presentationSeconds: z.union([
      z.literal(20),
      z.literal(30),
      z.literal(45),
      z.literal(60),
      z.null(),
    ]),
    discussionSeconds: z.number().int().min(10).max(600).nullable().default(10),
    crimeSeconds: z.number().int().min(5).max(300).default(25),
    accomplice: z.boolean(),
    witness: z.boolean(),
  })
  .strict()
  .refine(
    (s) => !s.witness || s.accomplice,
    "목격자는 공범이 있을 때만 사용할 수 있습니다.",
  );
const id = z.string().min(1).max(100);
export const commandSchema = z
  .object({
    id,
    actorId: id,
    action: z.discriminatedUnion("type", [
      z.object({ type: z.literal("advance") }).strict(),
      z.object({ type: z.literal("confirmRole") }).strict(),
      z
        .object({ type: z.literal("crimeSelect"), clueId: id, meansId: id })
        .strict(),
      z.object({ type: z.literal("chooseLocation"), tileId: id }).strict(),
      z
        .object({
          type: z.literal("placeMarker"),
          tileId: id,
          option: z.number().int().min(0).max(5),
        })
        .strict(),
      z.object({ type: z.literal("beginPresentations") }).strict(),
      z.object({ type: z.literal("endPresentation") }).strict(),
      z.object({ type: z.literal("replaceTile"), tileId: id }).strict(),
      z.object({ type: z.literal("startSolve") }).strict(),
      z.object({ type: z.literal("cancelSolve") }).strict(),
      z
        .object({
          type: z.literal("commitSolve"),
          targetId: id,
          clueId: id,
          meansId: id,
        })
        .strict(),
      z.object({ type: z.literal("reversalPick"), targetId: id }).strict(),
    ]),
  })
  .strict();
