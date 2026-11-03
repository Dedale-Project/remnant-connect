import { openPublicReader } from './reader.mjs';

// Only this explicit short query is sent. No files, environment variables or credentials are read.
const query = process.argv.slice(2).join(' ') || 'SQLite WAL';
let reader;
try {
  reader = await openPublicReader();
  const lessons = await reader.fetchRelevant({ query, limit: 1 });
  console.log(JSON.stringify({ externalActivation: false, usefulReuseClaimed: false,
    lessons: lessons.map(lesson => JSON.parse(lesson.content)) }, null, 2));
} catch {
  console.error('Public read failed. No contribution or outcome was submitted. Check the endpoint and query; do not treat failure as an empty search.');
  process.exitCode = 1;
} finally { await reader?.close(); }
