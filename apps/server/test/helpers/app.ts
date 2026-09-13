import { createApp, type AppDeps } from "../../src/app";
import { testEnv } from "./env";

export function buildTestApp(deps: Partial<AppDeps> = {}) {
  return createApp({ env: testEnv(), ...deps });
}
