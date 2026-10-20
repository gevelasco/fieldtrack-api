export type AuthPayload = {
  sub: number;
  clubId: number;
  role: string;
  username: string;
};

export type AuthUser = {
  id: number;
  clubId: number;
  username: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  photoDataUrl: string | null;
  theme: 'light' | 'dark';
};
