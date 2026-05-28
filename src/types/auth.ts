export interface MinimalUser {
  id: string
  name: string
  account?: string
  role?: string
}

export interface AuthState {
  token: string | null
  user: MinimalUser | null
  isAuthenticated: boolean
}

export interface LoginResponse {
  token: string
  user: MinimalUser
}
