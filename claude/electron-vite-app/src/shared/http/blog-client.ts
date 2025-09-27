// blog-client.ts
import { BaseApiClient } from './client'
import { TokenManager } from './token-manager'
import { ApiResponse } from './types'

export interface BlogPost {
  id: number
  title: string
  content: string
  author: string
  createdAt: string
}

export interface CreateBlogPostRequest {
  title: string
  content: string
  author: string
}

export class BlogApiClient extends BaseApiClient {
  constructor(baseURL: string = 'http://localhost:3002', tokenManager?: TokenManager) {
    super(baseURL, tokenManager || new TokenManager())
  }

  // Blog posts management
  async getBlogPosts(): Promise<ApiResponse<BlogPost[]>> {
    return this.request({
      method: 'GET',
      url: '/api/posts'
    })
  }

  async getBlogPost(id: number): Promise<ApiResponse<BlogPost>> {
    return this.request({
      method: 'GET',
      url: `/api/posts/${id}`
    })
  }

  async createBlogPost(postData: CreateBlogPostRequest): Promise<ApiResponse<BlogPost>> {
    return this.request({
      method: 'POST',
      url: '/api/posts',
      data: postData
    })
  }

  async updateBlogPost(id: number, postData: Partial<CreateBlogPostRequest>): Promise<ApiResponse<BlogPost>> {
    return this.request({
      method: 'PUT',
      url: `/api/posts/${id}`,
      data: postData
    })
  }

  async deleteBlogPost(id: number): Promise<ApiResponse<void>> {
    return this.request({
      method: 'DELETE',
      url: `/api/posts/${id}`
    })
  }

  // Search posts
  async searchBlogPosts(query: string): Promise<ApiResponse<BlogPost[]>> {
    return this.request({
      method: 'GET',
      url: '/api/posts/search',
      params: { q: query }
    })
  }
}