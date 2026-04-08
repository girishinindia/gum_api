export type AuthTokenPayload = {
  userId: string;
  email: string;
  role: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};
