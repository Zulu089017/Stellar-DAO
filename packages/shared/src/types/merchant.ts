export interface Merchant {
  id: string;
  name: string;
  email: string;
  website?: string;
  webhookUrl?: string;
  apiKeyHash: string;
  apiKeyPrefix: string;
  /** Comma-separated roles from the Role Manager contract */
  roles: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterMerchantRequest {
  name: string;
  email: string;
  website?: string;
  webhookUrl?: string;
}

export interface RegisterMerchantResponse {
  merchant: Merchant;
  /** The full API key — only returned once at registration */
  apiKey: string;
}

export interface GetMerchantResponse {
  merchant: Omit<Merchant, 'apiKeyHash'>;
}

export interface RotateApiKeyResponse {
  /** The new API key — only returned once */
  apiKey: string;
  apiKeyPrefix: string;
}
