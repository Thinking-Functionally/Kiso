import { readAllStr } from '../src/reader/reader.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
const src = process.argv[2]!;
const a = new Analyzer();
for (const f of readAllStr(src)) console.log(JSON.stringify(a.analyze(f)));
