// src/utils/truncateContent.ts

/**
 * Options for content truncation
 */
export interface TruncateOptions {
    /**
     * Maximum number of tokens (approximate) to keep
     */
    maxTokens?: number;
    
    /**
     * Type of truncation to apply:
     * - 'smart' (default): Try to keep sentences intact
     * - 'hard': Cut exactly at token count
     */
    mode?: 'smart' | 'hard';
    
    /**
     * Whether to include a message indicating content was truncated
     */
    includeTruncationMessage?: boolean;
  }
  
  /**
   * Truncates content to fit within a specified token limit
   * This is an approximate method since precise tokenization depends on the model
   * 
   * @param content - The content to truncate
   * @param options - Truncation options
   * @returns Truncated content
   */
  export function truncateContent(
    content: string, 
    options: TruncateOptions = {}
  ): string {
    const {
      maxTokens = 8000,
      mode = 'smart',
      includeTruncationMessage = true
    } = options;
    
    // If no limit or content is already under limit, return as is
    if (!maxTokens || content.length === 0) {
      return content;
    }
    
    // Quick estimation: ~4 chars per token as a rough approximation
    // This is not perfect but gives us a starting point
    const estimatedCharLimit = maxTokens * 4;
    
    // If content is already under our estimated limit, return as is
    if (content.length <= estimatedCharLimit) {
      return content;
    }
    
    let truncated: string;
    
    if (mode === 'smart') {
      // Smart truncation tries to break at sentence or paragraph boundaries
      // First get a slightly larger chunk than needed to find good break points
      const oversizedChunk = content.slice(0, Math.min(estimatedCharLimit * 1.2, content.length));
      
      // Try to find paragraph breaks first
      const paragraphs = oversizedChunk.split(/\n\s*\n/);
      let result = '';
      
      for (const paragraph of paragraphs) {
        if ((result + paragraph).length > estimatedCharLimit) {
          // If adding this paragraph would exceed our limit, try sentence-level truncation
          const sentences = paragraph.split(/(?<=[.!?])\s+/);
          for (const sentence of sentences) {
            if ((result + sentence).length <= estimatedCharLimit) {
              result += sentence + ' ';
            } else {
              break;
            }
          }
          break;
        }
        
        result += paragraph + '\n\n';
      }
      
      truncated = result.trim();
    } else {
      // Hard truncation just cuts at the character limit
      truncated = content.slice(0, estimatedCharLimit);
    }
    
    // Add truncation message if requested
    if (includeTruncationMessage && truncated.length < content.length) {
      const message = `\n\n[Content truncated to fit within context limit of approximately ${maxTokens} tokens]`;
      
      // Make sure adding the message doesn't push us over the limit
      if (truncated.length + message.length > estimatedCharLimit) {
        truncated = truncated.slice(0, estimatedCharLimit - message.length);
      }
      
      truncated += message;
    }
    
    return truncated;
  }
  
  /**
   * Truncates any string field in an object or array that exceeds the specified limit
   * Works recursively on nested objects and arrays
   * 
   * @param value - Object, array, or primitive to truncate
   * @param options - Truncation options
   * @returns Truncated copy of the input
   */
  export function truncateDeep<T>(value: T, options: TruncateOptions = {}): T {
    if (typeof value === 'string') {
      return truncateContent(value, options) as unknown as T;
    }
    
    if (Array.isArray(value)) {
      return value.map(item => truncateDeep(item, options)) as unknown as T;
    }
    
    if (value !== null && typeof value === 'object') {
      const result: Record<string, any> = {};
      
      for (const [key, val] of Object.entries(value as Record<string, any>)) {
        result[key] = truncateDeep(val, options);
      }
      
      return result as T;
    }
    
    // For other primitive types, return as is
    return value;
  }