export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  token: string;
  /** Epoch milliseconds. Absent means the store treats the token as session-only. */
  expiresAt?: number;
}
