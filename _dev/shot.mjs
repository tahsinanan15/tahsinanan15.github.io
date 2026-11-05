#!/usr/bin/env node
// Drives real headless Chrome for checks and screenshots: node _dev/shot.mjs plan.json
// plan: { url, out, shots: [{ name, w, h, mobile, reduced, eval, wait, fresh }] }. Always closes the browser.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'shot-')), port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn('/opt/google/chrome/chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--enable-automation', '--hide-scrollbars', '--mute-audio', '--disable-extensions', '--force-device-scale-factor=1', '--autoplay-policy=user-gesture-required'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const killAll = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(dir, { recursive: true, force: true }); } catch {} };
process.on('exit', killAll);
setTimeout(() => { console.error('timeout'); process.exit(3); }, plan.timeout || 170000);
async function tab() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' }); return r.json(); } catch { await sleep(250); } }
  throw new Error('no chrome');
}
function client(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(), logs = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) { pend.get(d.id)?.(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 300));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map((a) => a.value || a.description).join(' ').slice(0, 300));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('LOG ' + d.params.entry.text.slice(0, 160) + ' ' + (d.params.entry.url || '').slice(-60)); };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return new Promise((res) => { ws.onopen = () => res({ send, logs, close: () => ws.close() }); });
}
let seedFresh = true;
for (const s of plan.shots) {
  const t = await tab(); const c = await client(t.webSocketDebuggerUrl);
  await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Log.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dsf || 1, mobile: !!s.mobile });
  if (s.mobile) await c.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  if (s.reduced) await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (s.time) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const H=${s.time};const G=Date.prototype.getHours;Date.prototype.getHours=function(){return H}})()` });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: s.fresh ? "try{localStorage.removeItem('tahsin.booted')}catch(e){}" : "try{localStorage.setItem('tahsin.booted','1')}catch(e){}" });
  if (s.nojs) await c.send('Emulation.setScriptExecutionDisabled', { value: true });
  await c.send('Page.navigate', { url: (s.url || plan.url) + (s.hash || '') });
  await sleep(s.load || 1500);
  let out = null;
  if (s.eval) {
    const r = await c.send('Runtime.evaluate', { expression: `(async()=>{${s.eval}})()`, awaitPromise: true, returnByValue: true, userGesture: true });
    out = r.result?.exceptionDetails ? 'EVALERR ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) : r.result?.result?.value;
  }
  if (s.wait) await sleep(s.wait);
  if (s.name) { const shot = await c.send('Page.captureScreenshot', { format: s.jpeg ? 'jpeg' : 'png', quality: s.jpeg ? 80 : undefined }); writeFileSync(join(plan.out, s.name + (s.jpeg ? '.jpg' : '.png')), Buffer.from(shot.result.data, 'base64')); }
  console.log(JSON.stringify({ shot: s.name || '-', out, logs: c.logs }));
  c.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {});
}
process.exit(0);
