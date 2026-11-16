import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "org.board.secrethitler",
  appName: "Secret Hitler",
  webDir: "apps/client/dist",
  server: { androidScheme: "https" },
  ios: { contentInset: "automatic" },
  android: { backgroundColor: "#171a19" },
};
export default config;
