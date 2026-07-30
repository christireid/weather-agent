// Information-parity check (spec §5.4): for five seeded minutes, enumerate
// every fact the field conveys through the metaphor contract and state where
// Boring Mode + panel figures recover it. Output is pasted into
// docs/decisions-log.md as the Stage 4 gate record.
import { execSync } from 'node:child_process';

const out = execSync(
  `pnpm --silent --filter @market-weather/market exec tsx -e "
import { simulateDay, hashCombine, createRng } from './src/index';
const day = simulateDay(20260729);
const rng = createRng(hashCombine(20260729, 0x9a17));
const minutes = Array.from({length:5},()=>Math.floor(rng.next()*390));
for (const t of minutes) {
  const m = day.at(t);
  console.log('minute', t, m.clock, 'index', (m.index*100).toFixed(2)+'%');
  m.sectors.forEach((s,i)=>{
    console.log('  ', day.sectors[i].name.padEnd(14),
      'ret', (s.returnSinceOpen*100).toFixed(2).padStart(6)+'%',
      'mom', s.momentum.toFixed(2).padStart(5),
      'vol', s.volatility.toFixed(2),
      'volu', s.volume.toFixed(2));
  });
}
"`,
  { encoding: 'utf8' },
);
console.log(out);
