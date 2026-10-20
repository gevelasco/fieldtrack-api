type EnvConfig = {
  NODE_ENV: string;
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_DATABASE: string;
  DB_SSL?: string;
  ORIGIN: string;
  /** URL pública del FE (opcional; fallback: primer ORIGIN). */
  APP_URL?: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  SALT_ROUNDS: number;
  ALERT_WEBHOOK_URL?: string;
  ENABLE_SWAGGER?: string;
  /** Railway Bucket (Tigris / S3-compatible) — documentos de socios y solicitudes. */
  RW_URL?: string;
  RW_REGION?: string;
  RW_S3_BUCKET?: string;
  RW_ACCESS_KEY_ID?: string;
  RW_SECRET_ACCESS_KEY?: string;
};

export default EnvConfig;
