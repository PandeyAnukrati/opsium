import type { Chunk } from '../db/mockDb';

export interface Document {
  pageContent: string;
  metadata: {
    chunk: Chunk;
    [key: string]: unknown;
  };
}

export interface HuggingFaceEmbeddingsConfig {
  apiKey?: string;
  model?: string;
}

export class HuggingFaceEmbeddings {
  private apiKey: string;
  private model: string;

  constructor(config: HuggingFaceEmbeddingsConfig = {}) {
    this.apiKey = config.apiKey || localStorage.getItem('opsium_hf_token') || import.meta.env.VITE_HF_TOKEN || '';
    this.model = config.model || 'sentence-transformers/all-MiniLM-L6-v2';
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      // Fallback to offline deterministic mock embeddings if no API key is provided
      return texts.map(text => this.generateMockEmbedding(text));
    }

    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${this.model}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ inputs: texts })
        }
      );

      if (!response.ok) {
        throw new Error(`Hugging Face API returned error: ${response.statusText}`);
      }

      const embeddings = await response.json();
      
      // Basic validation of response structure
      if (Array.isArray(embeddings) && embeddings.length > 0 && Array.isArray(embeddings[0])) {
        return embeddings;
      }
      
      throw new Error('Invalid embeddings format received from Hugging Face');
    } catch (error) {
      console.error('Hugging Face embedding failed, falling back to mock embeddings:', error);
      return texts.map(text => this.generateMockEmbedding(text));
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    const embeddings = await this.embedDocuments([text]);
    return embeddings[0];
  }

  private generateMockEmbedding(text: string): number[] {
    let hash = 0;
    const content = text.toLowerCase();
    for (let i = 0; i < content.length; i++) {
      hash = content.charCodeAt(i) + ((hash << 5) - hash);
    }
    const vector: number[] = [];
    const size = 384; // Matches standard sentence-transformers output dimension
    for (let i = 0; i < size; i++) {
      vector.push(Math.sin(hash + i * 13));
    }
    // Normalize vector to unit length
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude === 0 ? vector : vector.map(val => val / magnitude);
  }
}

export class MemoryVectorStore {
  private memory: { document: Document; embedding: number[] }[] = [];
  private embeddings: HuggingFaceEmbeddings;

  constructor(embeddings: HuggingFaceEmbeddings) {
    this.embeddings = embeddings;
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map(doc => doc.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    
    documents.forEach((document, index) => {
      this.memory.push({
        document,
        embedding: vectors[index]
      });
    });
  }

  async similaritySearchVectorWithScore(
    queryVector: number[],
    k: number = 4
  ): Promise<[Document, number][]> {
    const results: [Document, number][] = this.memory.map(item => {
      const score = cosineSimilarity(queryVector, item.embedding);
      return [item.document, score];
    });

    // Sort by cosine similarity score descending
    results.sort((a, b) => b[1] - a[1]);
    return results.slice(0, k);
  }

  async similaritySearch(query: string, k: number = 4): Promise<[Document, number][]> {
    const queryVector = await this.embeddings.embedQuery(query);
    return this.similaritySearchVectorWithScore(queryVector, k);
  }
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  
  if (vecA.length !== vecB.length) {
    return 0;
  }

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
