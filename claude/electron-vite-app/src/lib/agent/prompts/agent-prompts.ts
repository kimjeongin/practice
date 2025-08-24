/**
 * Agent prompt templates for tool selection and reasoning
 */

import { MCPTool } from '../../mcp/types/mcp-server.types'
import { AgentMessage } from '../types/agent.types'

/**
 * System prompt for tool selection agent
 */
export function createToolSelectionSystemPrompt(availableTools: MCPTool[]): string {
  const toolDescriptions = availableTools.map(tool => {
    const requiredParams = tool.inputSchema.required || []
    const properties = Object.keys(tool.inputSchema.properties || {})
    
    return `- ${tool.name} (${tool.serverName}): ${tool.description}
  Input: ${properties.join(', ')} ${requiredParams.length > 0 ? `(required: ${requiredParams.join(', ')})` : ''}
  Category: ${tool.category || 'General'}`
  }).join('\n')

  return `You are an intelligent agent that can use various tools to help users. Your role is to:

1. ANALYZE the user's request carefully
2. DETERMINE if you need to use tools or can respond directly
3. SELECT the most appropriate tool if needed
4. PROVIDE clear reasoning for your decisions

Available Tools:
${toolDescriptions}

RESPONSE RULES:
- Always respond in valid JSON format
- If you need to use a tool, set "action": "use_tool"
- If you can answer directly, set "action": "respond"  
- If the request is unclear, set "action": "clarify"
- Always explain your reasoning
- Be concise but thorough in your analysis

Example Response Format:
{
  "reasoning": "The user is asking about X, which requires tool Y because...",
  "action": "use_tool",
  "toolName": "tool_name",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  },
  "confidence": 0.9
}

Remember: You are helping the user accomplish their goals efficiently and accurately.`
}

/**
 * Create user prompt for tool selection
 */
export function createToolSelectionPrompt(
  userQuery: string,
  conversationHistory: AgentMessage[],
  currentGoal?: string
): string {
  const historyContext = conversationHistory.length > 0 
    ? `\n\nConversation History:\n${formatConversationHistory(conversationHistory)}`
    : ''

  const goalContext = currentGoal 
    ? `\n\nCurrent Goal: ${currentGoal}`
    : ''

  return `User Request: ${userQuery}${historyContext}${goalContext}

Please analyze this request and decide the best action to take. Consider:
1. What the user is trying to accomplish
2. Whether existing tools can help
3. What information is needed
4. The most efficient approach

Respond in JSON format with your analysis and decision.`
}

/**
 * System prompt for continue decision
 */
export function createContinueDecisionSystemPrompt(): string {
  return `You are an agent decision-maker. Your role is to determine whether to continue with more actions or provide the final response to the user.

ANALYSIS CRITERIA:
1. Has the user's request been fully satisfied?
2. Is additional information needed to complete the task?
3. Would additional tool usage be beneficial?
4. Are there logical next steps to improve the answer?

RESPONSE RULES:
- Respond in valid JSON format only
- Set "continue": true only if more actions would meaningfully help
- Set "continue": false when ready to respond to user
- Always provide clear reasoning
- Consider efficiency - don't over-complicate simple requests

Example Response:
{
  "continue": true,
  "reasoning": "I have search results but need to analyze the specific document mentioned to provide a complete answer",
  "nextGoal": "Read and analyze the document to extract the requested information"
}`
}

/**
 * Create continue decision prompt
 */
export function createContinueDecisionPrompt(
  conversationHistory: AgentMessage[],
  lastToolResult: any,
  originalQuery: string
): string {
  const historyFormatted = formatConversationHistory(conversationHistory)
  const lastResultSummary = formatToolResult(lastToolResult)

  return `Original User Request: ${originalQuery}

Conversation So Far:
${historyFormatted}

Latest Tool Result:
${lastResultSummary}

Should I continue with more actions or provide the final response to the user?

Consider:
- Is the user's request fully satisfied?
- Would additional tools provide more value?
- Is the current information sufficient for a good response?

Respond in JSON format with your decision and reasoning.`
}

/**
 * System prompt for final response generation
 */
export function createFinalResponseSystemPrompt(): string {
  return `You are a helpful AI assistant providing the final response to a user query. Your role is to:

1. SYNTHESIZE information from tool results
2. PROVIDE a clear, comprehensive answer
3. FORMAT the response appropriately
4. ACKNOWLEDGE any limitations or uncertainties

RESPONSE GUIDELINES:
- Be conversational and helpful
- Use information from tool results accurately
- Don't mention internal processes (tool calls, iterations)
- Focus on answering the user's original question
- Be concise but complete
- Use formatting (markdown) when appropriate for readability

If multiple tools were used, synthesize all relevant information into a coherent response.
If no tools were used, provide a direct, helpful answer based on your knowledge.`
}

/**
 * Create final response prompt
 */
export function createFinalResponsePrompt(
  originalQuery: string,
  conversationHistory: AgentMessage[],
  toolResults: any[]
): string {
  const historyFormatted = formatConversationHistory(conversationHistory)
  const resultsFormatted = toolResults.map(formatToolResult).join('\n\n')

  return `User's Original Question: ${originalQuery}

Actions Taken:
${historyFormatted}

Information Gathered:
${resultsFormatted}

Please provide a comprehensive, helpful response to the user's question based on the information above. Make it conversational and directly address what they were asking for.`
}

/**
 * Error recovery prompt
 */
export function createErrorRecoveryPrompt(
  error: string,
  failedToolName: string,
  originalQuery: string,
  availableTools: MCPTool[]
): string {
  const alternativeTools = availableTools
    .filter(tool => tool.name !== failedToolName)
    .map(tool => `- ${tool.name}: ${tool.description}`)
    .join('\n')

  return `An error occurred while using the ${failedToolName} tool:
Error: ${error}

Original User Request: ${originalQuery}

Available Alternative Tools:
${alternativeTools}

Please suggest the best way to proceed:
1. Try a different tool that might accomplish the same goal
2. Provide the best possible answer without additional tools
3. Ask the user for clarification or different approach

Respond in JSON format:
{
  "reasoning": "Explanation of the situation and recommendation",
  "action": "use_tool" | "respond" | "clarify",
  "toolName": "alternative_tool_name" (if action is use_tool),
  "parameters": {...} (if action is use_tool),
  "message": "Message to user" (if action is respond or clarify)
}`
}

/**
 * Clarification request prompt
 */
export function createClarificationPrompt(
  userQuery: string,
  ambiguousAspects: string[]
): string {
  return `The user's request needs clarification on the following points:
${ambiguousAspects.map(aspect => `- ${aspect}`).join('\n')}

Original Request: ${userQuery}

Please generate a helpful clarification question that will help me better understand what the user needs. Be specific and offer options when possible.

Example: "I'd be happy to help you search for information. Could you please specify: Are you looking for recent news articles, research papers, or general information about [topic]? Also, any particular time frame or source preferences?"

Keep the tone friendly and helpful.`
}

/**
 * Format conversation history for prompts
 */
function formatConversationHistory(messages: AgentMessage[]): string {
  return messages.map(msg => {
    switch (msg.role) {
      case 'user':
        return `User: ${msg.content}`
      case 'assistant':
        return `Assistant: ${msg.content}`
      case 'tool':
        const toolInfo = msg.toolCall 
          ? `[Used ${msg.toolCall.toolName}${msg.toolResult?.success ? ' successfully' : ' with error'}]`
          : '[Tool result]'
        return `${toolInfo}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`
      default:
        return `${msg.role}: ${msg.content}`
    }
  }).join('\n')
}

/**
 * Format tool result for prompts
 */
function formatToolResult(result: any): string {
  if (typeof result === 'object') {
    if (result.content) {
      return result.content.toString().substring(0, 500) + (result.content.length > 500 ? '...' : '')
    }
    return JSON.stringify(result).substring(0, 500) + '...'
  }
  return result.toString().substring(0, 500)
}

/**
 * Get reasoning enhancement prompt for complex queries
 */
export function createReasoningEnhancementPrompt(query: string): string {
  return `This is a complex query that may benefit from step-by-step reasoning: "${query}"

Please break this down into logical steps:
1. What is the user ultimately trying to achieve?
2. What information or actions are needed?
3. What's the most logical sequence to approach this?
4. What tools or methods would be most effective?

Provide your analysis in a structured format that will help in tool selection and execution planning.`
}

/**
 * Multi-step planning prompt
 */
export function createMultiStepPlanningPrompt(
  query: string,
  availableTools: MCPTool[]
): string {
  const toolsList = availableTools.map(tool => 
    `- ${tool.name}: ${tool.description}`
  ).join('\n')

  return `Complex Query: ${query}

Available Tools:
${toolsList}

This query might require multiple steps. Please create a plan:

{
  "analysis": "Break down what the user wants to accomplish",
  "steps": [
    {
      "step": 1,
      "action": "description of action",
      "tool": "tool_name",
      "purpose": "why this step is needed"
    }
  ],
  "reasoning": "Overall strategy explanation"
}

Focus on efficiency while being thorough.`
}