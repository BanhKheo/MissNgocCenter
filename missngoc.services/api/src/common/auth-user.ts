export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  permissions: string[];
  mustChangePassword: boolean;
}

export interface JwtPayload {
  sub: string;
  username: string;
  fullName: string;
  role: string;
  permissions: string[];
  mustChangePassword: boolean;
}
