import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("phrases.js", "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nthis.PHRASES = PHRASES;`, context);

const phrases = context.PHRASES;

const stopWords = new Set([
  "こと",
  "もの",
  "ため",
  "よう",
  "それ",
  "これ",
  "という",
  "として",
  "される",
  "できる",
  "について",
  "意味",
  "概念",
  "表現",
  "重要",
  "現代",
  "由来",
  "知られる",
  "使われる",
  "考える",
  "示す",
  "指す",
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"『』「」（）()[\]、。,.・:;!?！？／/\\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseKey(value) {
  return normalizeText(value)
    .replace(/\s/g, "")
    .replace(/は/g, "")
    .replace(/を/g, "")
    .replace(/に/g, "")
    .replace(/と/g, "")
    .replace(/の/g, "")
    .replace(/が/g, "");
}

function tokenize(item) {
  const text = normalizeText(
    [
      item.phrase,
      item.original,
      item.person,
      item.person_en,
      item.work,
      item.category,
      item.summary,
      item.note,
      ...(item.fields || []),
      ...(item.tags || []),
    ].join(" ")
  );

  const tokens = new Set();
  for (const token of text.split(/\s+/)) {
    if (token.length >= 2 && !stopWords.has(token)) tokens.add(token);
  }

  const jaTerms = text.match(/[一-龠ぁ-んァ-ヶー]{2,}/g) || [];
  for (const term of jaTerms) {
    if (!stopWords.has(term)) tokens.add(term);
  }

  return tokens;
}

function jaccard(a, b) {
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function overlapReasons(a, b, phraseA, phraseB, tokensA, tokensB, similarity) {
  const reasons = [];
  if (a.category === b.category) reasons.push("same category");
  if (a.person === b.person) reasons.push("same person/source");
  if (a.work && a.work === b.work) reasons.push("same work");
  if (phraseA.includes(phraseB) || phraseB.includes(phraseA)) reasons.push("phrase contains the other");

  const sharedFields = (a.fields || []).filter((field) => (b.fields || []).includes(field));
  const sharedTags = (a.tags || []).filter((tag) => (b.tags || []).includes(tag));
  if (sharedFields.length >= 2) reasons.push(`shared fields: ${sharedFields.slice(0, 3).join(", ")}`);
  if (sharedTags.length >= 2) reasons.push(`shared tags: ${sharedTags.slice(0, 3).join(", ")}`);

  const sharedTokens = [...tokensA].filter((token) => tokensB.has(token));
  if (sharedTokens.length >= 5) reasons.push(`shared terms: ${sharedTokens.slice(0, 6).join(", ")}`);
  reasons.push(`similarity ${similarity.toFixed(2)}`);
  return reasons;
}

const tokenSets = new Map(phrases.map((item) => [item.id, tokenize(item)]));
const phraseKeys = new Map(phrases.map((item) => [item.id, phraseKey(item.phrase)]));
const candidates = [];

for (let i = 0; i < phrases.length; i += 1) {
  for (let j = i + 1; j < phrases.length; j += 1) {
    const a = phrases[i];
    const b = phrases[j];
    const phraseA = phraseKeys.get(a.id);
    const phraseB = phraseKeys.get(b.id);
    const tokensA = tokenSets.get(a.id);
    const tokensB = tokenSets.get(b.id);
    const similarity = jaccard(tokensA, tokensB);
    const sharedFields = (a.fields || []).filter((field) => (b.fields || []).includes(field)).length;
    const sharedTags = (a.tags || []).filter((tag) => (b.tags || []).includes(tag)).length;
    const containsPhrase = phraseA.length >= 4 && phraseB.length >= 4 && (phraseA.includes(phraseB) || phraseB.includes(phraseA));
    const sameSource = a.person === b.person || (a.work && a.work === b.work);

    const likelyOverlap =
      containsPhrase ||
      (sameSource && similarity >= 0.22) ||
      (a.category === b.category && sharedFields >= 2 && sharedTags >= 2) ||
      similarity >= 0.34;

    if (likelyOverlap) {
      candidates.push({
        score: Number((similarity + (containsPhrase ? 0.2 : 0) + (sameSource ? 0.08 : 0)).toFixed(3)),
        a: { id: a.id, phrase: a.phrase, category: a.category, person: a.person, status: a.status },
        b: { id: b.id, phrase: b.phrase, category: b.category, person: b.person, status: b.status },
        reasons: overlapReasons(a, b, phraseA, phraseB, tokensA, tokensB, similarity),
      });
    }
  }
}

candidates.sort((a, b) => b.score - a.score || a.a.id.localeCompare(b.a.id));

const report = {
  count: phrases.length,
  candidateCount: candidates.length,
  candidates: candidates.slice(0, 80),
};

console.log(JSON.stringify(report, null, 2));
