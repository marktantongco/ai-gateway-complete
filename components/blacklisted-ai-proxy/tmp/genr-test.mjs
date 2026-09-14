import { fetchGenerator } from '../src/utils/generate-random-fetcher.js';

const slug = process.argv[2] || 'credit-cards';
const r = await fetchGenerator(slug, { outDir: 'tmp/genr' });
console.log(JSON.stringify(r, null, 2));
