const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'was', 'were', 'are', 'but',
  'not', 'you', 'your', 'they', 'them', 'their', 'can', 'could', 'would', 'should', 'please',
  'after', 'before', 'into', 'onto', 'over', 'under', 'than', 'then', 'when', 'what', 'who',
  'how', 'why', 'any', 'all', 'our', 'out', 'off', 'its', 'it', 'a', 'an', 'of', 'to', 'in',
  'on', 'at', 'by', 'or', 'if', 'is', 'be', 'as', 'we', 'my', 'me', 'do', 'did', 'does', 'been',
  'being', 'there', 'here', 'just', 'also', 'still', 'today', 'someone', 'something',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

export function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

export function l2normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

export function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += left[i] * right[i];
  return sum;
}

export function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const total = new Array(vectors[0].length).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < total.length; i += 1) total[i] += vector[i];
  }
  return l2normalize(total.map((value) => value / vectors.length));
}

export const VECTOR_DIM = 256;
const VOCAB_DIM = 224;
const OOV_DIM = VECTOR_DIM - VOCAB_DIM;

export class TfidfVectorizer {
  vocab = new Map<string, number>();
  idf: number[] = [];

  fit(documents: string[]): void {
    const df = new Map<string, number>();
    for (const document of documents) {
      const seen = new Set(tokenize(document));
      for (const token of seen) df.set(token, (df.get(token) ?? 0) + 1);
    }
    const kept = [...df.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, VOCAB_DIM);
    this.vocab = new Map(kept.map(([token], index) => [token, index]));
    const total = documents.length || 1;
    this.idf = kept.map(([, count]) => Math.log((total + 1) / (count + 1)) + 1);
  }

  transform(text: string): number[] {
    const vector = new Array(VECTOR_DIM).fill(0);
    const counts = new Map<string, number>();
    for (const token of tokenize(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
    for (const [token, count] of counts) {
      const weight = 1 + Math.log(count);
      const index = this.vocab.get(token);
      if (index !== undefined) {
        vector[index] += weight * this.idf[index];
      } else {
        vector[VOCAB_DIM + (hashString(token) % OOV_DIM)] += weight;
      }
    }
    return l2normalize(vector);
  }

  toJSON(): { vocab: [string, number][]; idf: number[] } {
    return { vocab: [...this.vocab.entries()], idf: this.idf };
  }

  static fromJSON(payload: { vocab: [string, number][]; idf: number[] }): TfidfVectorizer {
    const vectorizer = new TfidfVectorizer();
    vectorizer.vocab = new Map(payload.vocab);
    vectorizer.idf = payload.idf;
    return vectorizer;
  }
}

export function topTerms(text: string, limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}
