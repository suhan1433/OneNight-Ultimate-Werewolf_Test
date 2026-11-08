import { simulate, type Scenario } from "./simulator.js";
const count = Number(process.argv[2] ?? 6);
const seed = process.argv[3] ?? "neon-harbor";
if (!Number.isInteger(count) || count < 4 || count > 12)
  throw new Error("인원은 4~12명입니다.");
const scenarios: Scenario[] = ["solved", "exhausted", "final-round"];
if (count >= 8)
  scenarios.push("reversal-win", "reversal-loss", "reversal-timeout");
for (const scenario of scenarios) {
  const { state, ...report } = simulate({ players: count, seed, scenario });
  console.log(
    JSON.stringify({
      ...report,
      finalRound: state.round,
      reason: state.reason,
    }),
  );
}
