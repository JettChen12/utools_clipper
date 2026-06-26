export interface AppSettings {
  mcpUrl: string;
  mcpKey: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  mcpUrl: 'http://127.0.0.1:3501/mcp',
  mcpKey: '',
  aiBaseUrl: 'https://api.deepseek.com',
  aiApiKey: '',
  aiModel: 'deepseek-chat',
};
