import raw from "./content/ko.json" with { type: "json" };
import { z } from "zod";
const tileSchema = z.object({
  id: z.string(),
  kind: z.enum(["location", "cause", "hint", "event"]),
  title: z.string(),
  options: z.array(z.string().max(8)).length(6),
  eventText: z.string().optional(),
  effect: z.enum(["shorten", "lengthen", "untimed"]).optional(),
});
export const content = z
  .object({
    locale: z.literal("ko"),
    cards: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["clue", "means"]),
        label: z.string().max(10),
        icon: z.string(),
      }),
    ),
    tiles: z.array(tileSchema),
  })
  .parse(raw);
