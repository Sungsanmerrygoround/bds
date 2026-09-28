import { config } from "dotenv";

// 로컬: .env.local / GitHub Actions: 시크릿이 이미 process.env에 있음
config({ path: ".env.local", quiet: true });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name}가 비어 있습니다 (.env.local 확인)`);
  return v;
}
