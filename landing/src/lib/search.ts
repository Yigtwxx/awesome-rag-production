/**
 * A tiny sparse retriever (TF-IDF + cosine similarity) over the catalog: the
 * same first stage many RAG systems use before dense retrieval and reranking.
 * Runs entirely in the browser; ~130 short documents, no index to ship.
 */
const STOPWORDS = new Set(
  'a an and are as at be by can for from how i in into is it its my of on or so that the this to use using with your you do does what which when where why we our'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t));
}

export interface SearchDoc {
  id: number;
  /** Fields are weighted by repetition: the name counts three times. */
  fields: { text: string; weight: number }[];
}

export interface SearchHit {
  id: number;
  score: number;
}

export interface Index {
  search(query: string, k: number): SearchHit[];
}

export function buildIndex(docs: SearchDoc[]): Index {
  const termFreqs = docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const field of doc.fields) {
      for (const token of tokenize(field.text)) {
        tf.set(token, (tf.get(token) ?? 0) + field.weight);
      }
    }
    return tf;
  });

  const docFreq = new Map<string, number>();
  for (const tf of termFreqs) {
    for (const term of tf.keys())
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }
  const idf = (term: string): number =>
    Math.log(1 + docs.length / (1 + (docFreq.get(term) ?? 0)));

  const vectors = termFreqs.map((tf) => {
    const vec = new Map<string, number>();
    let norm = 0;
    for (const [term, freq] of tf) {
      const w = (1 + Math.log(freq)) * idf(term);
      vec.set(term, w);
      norm += w * w;
    }
    return { vec, norm: Math.sqrt(norm) || 1 };
  });

  const vocabulary = [...docFreq.keys()];

  /**
   * Unknown query terms expand to vocabulary terms they prefix ("pars" ->
   * "parse", "parser", "parsing"), so results keep up while someone types.
   */
  const expand = (token: string): [string, number][] => {
    if (docFreq.has(token) || token.length < 3) return [[token, 1]];
    const matches = vocabulary
      .filter((term) => term.startsWith(token))
      .slice(0, 6);
    return matches.length
      ? matches.map((term) => [term, 1 / matches.length])
      : [[token, 1]];
  };

  return {
    search(query, k) {
      const qTokens = tokenize(query);
      if (!qTokens.length) return [];
      const qVec = new Map<string, number>();
      for (const token of qTokens) {
        for (const [term, share] of expand(token)) {
          qVec.set(term, (qVec.get(term) ?? 0) + share);
        }
      }
      let qNorm = 0;
      for (const [t, f] of qVec) {
        const w = (1 + Math.log(Math.max(f, 1))) * idf(t) * Math.min(f, 1);
        qVec.set(t, w);
        qNorm += w * w;
      }
      qNorm = Math.sqrt(qNorm) || 1;

      const hits: SearchHit[] = [];
      vectors.forEach(({ vec, norm }, i) => {
        let dot = 0;
        for (const [t, w] of qVec) dot += w * (vec.get(t) ?? 0);
        if (dot > 0)
          hits.push({ id: docs[i]!.id, score: dot / (norm * qNorm) });
      });
      return hits.sort((a, b) => b.score - a.score).slice(0, k);
    },
  };
}
