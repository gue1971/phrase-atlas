import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("phrases.js", "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nthis.PHRASES = PHRASES;`, context);

const phrases = context.PHRASES;

const countBy = (items, key) =>
  items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});

const sortObject = (object) =>
  Object.fromEntries(Object.entries(object).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")));

const lengthRows = phrases
  .map((item) => ({
    id: item.id,
    phrase: item.phrase,
    category: item.category,
    status: item.status,
    fame: item.fame,
    summary: item.summary.length,
    explanation: item.explanation.length,
    note: item.note.length,
  }))
  .sort((a, b) => a.explanation - b.explanation);

const repeatedPeople = Object.entries(countBy(phrases, "person"))
  .filter(([, count]) => count >= 3)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));

const report = {
  count: phrases.length,
  category: sortObject(countBy(phrases, "category")),
  status: sortObject(countBy(phrases, "status")),
  fame: sortObject(countBy(phrases, "fame")),
  explanation: {
    min: lengthRows[0]?.explanation ?? 0,
    median: lengthRows[Math.floor(lengthRows.length / 2)]?.explanation ?? 0,
    max: lengthRows.at(-1)?.explanation ?? 0,
    shortest: lengthRows.slice(0, 15),
    longest: lengthRows.slice(-10).reverse(),
  },
  repeatedPeople,
};

console.log(JSON.stringify(report, null, 2));
