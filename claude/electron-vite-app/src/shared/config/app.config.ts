/**
 * Shared Application Configuration
 * Used across main process and renderer
 */

export interface AppModelInfo {
  name: string
  displayName: string
  version: string
  contextLength: number
}

export const APP_MODEL_CONFIG = {
  // Current active model
  currentModel: {
    name: 'deepseek-r1:1.5b',
    displayName: 'DeepSeek R1 1.5B',
    version: '1.5b',
    contextLength: 8192,
  } as AppModelInfo,

  // Available models for reference
  availableModels: [
    {
      name: 'deepseek-r1:1.5b',
      displayName: 'DeepSeek R1 1.5B',
      version: '1.5b',
      contextLength: 8192,
    },
    {
      name: 'qwen3:0.6b',
      displayName: 'Qwen3 0.6B',
      version: '0.6b',
      contextLength: 4096,
    },
    {
      name: 'qwen3:1.7b',
      displayName: 'Qwen3 1.7B',
      version: '1.7b',
      contextLength: 8192,
    },
    {
      name: 'qwen3:4b',
      displayName: 'Qwen3 4B',
      version: '4b',
      contextLength: 16384,
    },
  ] as AppModelInfo[],
}

export const getAppModelInfo = () => APP_MODEL_CONFIG.currentModel
export const getAppModelDisplayName = () => APP_MODEL_CONFIG.currentModel.displayName
export const getAppModelName = () => APP_MODEL_CONFIG.currentModel.name