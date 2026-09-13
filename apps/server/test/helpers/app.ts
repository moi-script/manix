import request from "supertest";
import { createApp, type AppDeps } from "../../src/app";
import { testEnv } from "./env";

export type TestApp = ReturnType<typeof createApp>;

export function buildTestApp(deps: Partial<AppDeps> = {}): TestApp {
  return createApp({ env: testEnv(), ...deps });
}

let userCounter = 0;

export async function registerAgent(app: TestApp) {
  userCounter += 1;
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({
    email: `user${userCounter}@example.com`,
    username: `user_${userCounter}`,
    password: "password123",
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
