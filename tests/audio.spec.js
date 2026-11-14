import { expect, test } from '@playwright/test';
import { boot, clickTile } from './helpers.js';
import { inspectAudio } from './iteration2-hooks.js';

const audioState = page => page.evaluate(() => ({
  contexts: window.__qaAudio.contexts.length,
  starts: window.__qaAudio.starts, active: window.__qaAudio.active, peak: window.__qaAudio.peak,
  states: window.__qaAudio.contexts.map(c => c.state),
  resumes: window.__qaAudio.contexts.reduce((n, c) => n + c.resumes, 0),
}));
const burst = page => page.evaluate(() => {
  for (let i = 0; i < 100; i++) window.__qaAudioController.handleCombatEvent({ type: 'shot', turretType: 'basic' });
});

test('audio gesture initialization, mute persistence and visibility resume discard suppressed cues @webgl', async ({ page }, info) => {
  await inspectAudio(page);
  await boot(page, info.project.name);
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    window.__qaAudio.visibility(true);
    window.__qaAudio.visibility(false);
  });
  await burst(page);
  expect(await audioState(page)).toMatchObject({ contexts: 0, starts: 0 });
  // A real click supplies the application's unlock gesture.
  await page.locator('#mute').click();
  await expect.poll(() => audioState(page)).toMatchObject({ contexts: 1, states: ['running'] });
  await clickTile(page, 0, 1);
  expect((await audioState(page)).starts).toBeGreaterThan(0);
  await page.evaluate(() => window.__qaAudio.visibility(true));
  await expect.poll(() => audioState(page)).toMatchObject({ active: 0, states: ['suspended'] });
  const hidden = await audioState(page);
  await burst(page);
  expect(await audioState(page)).toEqual(hidden);
  await page.evaluate(() => window.__qaAudio.visibility(false));
  await expect.poll(() => audioState(page)).toMatchObject({ states: ['running'], starts: hidden.starts, active: 0 });
  expect((await audioState(page)).resumes).toBeGreaterThan(hidden.resumes);
  // Coalesce rapid hide/show while the asynchronous suspend is still settling.
  await page.evaluate(() => {
    window.__qaAudio.visibility(true);
    window.__qaAudio.visibility(false);
  });
  await expect.poll(() => audioState(page)).toMatchObject({ states: ['running'], active: 0, starts: hidden.starts });
  // Muting also stops scheduled voices and drops incoming events.
  await clickTile(page, 0, 1);
  expect((await audioState(page)).active).toBeGreaterThan(0);
  await page.locator('#mute').click();
  await expect.poll(() => audioState(page)).toMatchObject({ states: ['suspended'], active: 0 });
  const muted = await audioState(page);
  await burst(page);
  expect(await audioState(page)).toEqual(muted);
  await page.locator('#mute').click();
  await expect.poll(() => audioState(page)).toMatchObject({ states: ['running'] });
  // Only the optional enable click cue may be new; no 100-event backlog.
  expect((await audioState(page)).starts - muted.starts).toBeLessThanOrEqual(1);
  await page.reload();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => window.aegisGrid?.frames ?? 0)).toBeGreaterThan(2);
  expect(await audioState(page)).toMatchObject({ contexts: 0, starts: 0 });
  await clickTile(page, 0, 1);
  expect((await audioState(page)).contexts).toBe(1);
  await page.locator('#mute').click();
  await page.reload();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  expect(await audioState(page)).toMatchObject({ contexts: 0, starts: 0 });
});

test('audio polyphony never exceeds 12 voices and priority stealing releases them @webgl', async ({ page }, info) => {
  await inspectAudio(page);
  await boot(page, info.project.name);
  await page.locator('#mute').click();
  await expect.poll(() => audioState(page)).toMatchObject({ states: ['running'] });
  await page.evaluate(() => window.__qaAudio.finish());
  const before = (await audioState(page)).starts;
  await burst(page);
  expect(await audioState(page)).toMatchObject({ active: 12, peak: 12, starts: before + 12 });
  await page.evaluate(() => window.__qaAudioController.handleCombatEvent({ type: 'defeat' }));
  expect(await audioState(page)).toMatchObject({ active: 12, peak: 12, starts: before + 16 });
  await page.evaluate(() => window.__qaAudio.finish());
  expect((await audioState(page)).active).toBe(0);
  await page.evaluate(() => window.__qaAudioController.handleCombatEvent({ type: 'shot', turretType: 'rail' }));
  expect((await audioState(page)).active).toBe(1);
  await page.locator('#mute').click();
  expect((await audioState(page)).active).toBe(0);
  await info.attach('audio-polyphony', { body: JSON.stringify(await audioState(page)), contentType: 'application/json' });
});

for (const failure of ['constructor', 'resume', 'gain', 'oscillator']) {
  test(`AudioContext ${failure} failure leaves gameplay responsive @webgl`, async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await inspectAudio(page, failure);
    await boot(page, info.project.name);
    await page.locator('#mute').click();
    await clickTile(page, 0, 1);
    await expect(page.locator('#credits')).toHaveText('80');
    await page.locator('#start').click();
    await expect.poll(() => page.evaluate(() => window.aegisGrid.game.enemies)).toBeGreaterThan(0);
    const frames = await page.evaluate(() => window.aegisGrid.frames);
    await expect.poll(() => page.evaluate(() => window.aegisGrid.frames)).toBeGreaterThan(frames + 5);
    expect((await audioState(page)).active).toBe(0);
    expect(errors).toEqual([]);
  });
}
