import type { OllamaModel } from '../agent/types/agent.types'

/**
 * Centralized Model Configuration
 * All model references should use this configuration to avoid hardcoding
 */

export interface ModelConfig {
  /** Default model for agent operations */
  defaultModel: OllamaModel
  /** Available models */
  availableModels: OllamaModel[]
  /** Model-specific configurations */
  modelConfigs: Partial<Record<OllamaModel, {
    temperature: number
    maxTokens?: number
    contextLength?: number
  }>>
}

/**
 * Default model configuration
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  // Main model for agent operations - easy to change here
  defaultModel: 'deepseek-r1:1.5b',

  // Available models list
  availableModels: [
    'deepseek-r1:1.5b',
    'qwen3:0.6b',
    'qwen3:1.7b',
    'qwen3:4b',
  ],

  // Model-specific configurations
  modelConfigs: {
    'deepseek-r1:1.5b': {
      temperature: 0.3,
      maxTokens: 4096,
      contextLength: 8192,
    },
    'qwen3:0.6b': {
      temperature: 0.3,
      maxTokens: 2048,
      contextLength: 4096,
    },
    'qwen3:1.7b': {
      temperature: 0.3,
      maxTokens: 4096,
      contextLength: 8192,
    },
    'qwen3:4b': {
      temperature: 0.3,
      maxTokens: 8192,
      contextLength: 16384,
    },
  }
}

/**
 * Get the default model
 */
export function getDefaultModel(): OllamaModel {
  return DEFAULT_MODEL_CONFIG.defaultModel
}

/**
 * Get model configuration for a specific model
 */
export function getModelConfig(model: OllamaModel) {
  return DEFAULT_MODEL_CONFIG.modelConfigs[model] || DEFAULT_MODEL_CONFIG.modelConfigs[DEFAULT_MODEL_CONFIG.defaultModel]
}

/**
 * Get available models
 */
export function getAvailableModels(): OllamaModel[] {
  return DEFAULT_MODEL_CONFIG.availableModels
}

/**
 * Check if a model is available
 */
export function isModelAvailable(model: OllamaModel): boolean {
  return DEFAULT_MODEL_CONFIG.availableModels.includes(model)
}