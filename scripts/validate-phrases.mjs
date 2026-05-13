import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("phrases.js", "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nthis.PHRASES = PHRASES;`, context);

const phrases = context.PHRASES;
const statuses = new Set(["原典に近い", "定訳", "要約表現", "伝承", "概念語", "誤解注意"]);
const categories = new Set([
  "哲学・思想",
  "政治・革命",
  "経済",
  "科学史",
  "数学・情報",
  "宗教・倫理",
  "文学・芸術",
  "神話・故事",
  "日本思想",
]);
const required = [
  "id",
  "phrase",
  "original",
  "person",
  "person_en",
  "year",
  "work",
  "category",
  "fields",
  "fame",
  "status",
  "summary",
  "explanation",
  "note",
  "tags",
];

const ids = new Set();
const problems = [];
const explanationLengths = [];

if (!Array.isArray(phrases)) {
  problems.push("PHRASES must be an array.");
} else {
  for (const item of phrases) {
    const label = item?.id || item?.phrase || "(unknown)";

    for (const key of required) {
      if (!(key in item)) {
        problems.push(`${label}: missing ${key}`);
      }
    }

    if (ids.has(item.id)) {
      problems.push(`${label}: duplicate id`);
    }
    ids.add(item.id);

    if (!/^[a-z0-9_]+$/.test(item.id)) {
      problems.push(`${label}: id must be snake_case ascii`);
    }
    if (!categories.has(item.category)) {
      problems.push(`${label}: unknown category ${item.category}`);
    }
    if (!statuses.has(item.status)) {
      problems.push(`${label}: unknown status ${item.status}`);
    }
    if (!Number.isInteger(item.fame) || item.fame < 1 || item.fame > 5) {
      problems.push(`${label}: fame must be an integer from 1 to 5`);
    }
    if (item.year !== null && !Number.isInteger(item.year)) {
      problems.push(`${label}: year must be an integer or null`);
    }
    if (!Array.isArray(item.fields) || item.fields.length === 0) {
      problems.push(`${label}: fields must be a non-empty array`);
    }
    if (!Array.isArray(item.tags) || item.tags.length === 0) {
      problems.push(`${label}: tags must be a non-empty array`);
    }
    if (typeof item.summary !== "string" || item.summary.length < 30) {
      problems.push(`${label}: summary is too short`);
    }
    if (typeof item.explanation !== "string" || item.explanation.length < 350) {
      problems.push(`${label}: explanation is too short`);
    } else {
      explanationLengths.push(item.explanation.length);
    }
    if (typeof item.note !== "string" || item.note.length < 25) {
      problems.push(`${label}: note is too short`);
    }
  }
}

explanationLengths.sort((a, b) => a - b);
const report = {
  count: Array.isArray(phrases) ? phrases.length : 0,
  problems,
  explanation: {
    min: explanationLengths[0] ?? 0,
    median: explanationLengths[Math.floor(explanationLengths.length / 2)] ?? 0,
    max: explanationLengths.at(-1) ?? 0,
  },
};

console.log(JSON.stringify(report, null, 2));

if (problems.length > 0) {
  process.exitCode = 1;
}
