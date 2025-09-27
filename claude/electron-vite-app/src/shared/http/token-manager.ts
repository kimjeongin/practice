// token-manager.ts
export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export class TokenManager {
  private accessToken: string | null = null
  private refreshToken: string | null = null

  constructor(initial?: TokenPair) {
    if (initial) {
      this.accessToken = initial.accessToken
      this.refreshToken = initial.refreshToken
    }
  }

  getAccessToken() {
    return this.accessToken
  }

  getRefreshToken() {
    return this.refreshToken
  }

  updateTokens(tokens: TokenPair) {
    this.accessToken = tokens.accessToken
    this.refreshToken = tokens.refreshToken
  }

  clearTokens() {
    this.accessToken = null
    this.refreshToken = null
  }

  async refreshTokens(apiBaseUrl: string): Promise<void> {
    if (!this.refreshToken) throw new Error('No refresh token available')

    const res = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    })

    if (!res.ok) throw new Error('Failed to refresh token')
    const data = (await res.json()) as TokenPair
    this.updateTokens(data)
  }
}
