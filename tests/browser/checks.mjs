// The browser checks, in the order they run. Each starts from a fresh app (see ../browser.mjs).
// app: { page, idle, fresh, state, design, feature, features, notes, tool, field, set, downloads, toasts, tempFile, answer, dialogs, assert }

const stlTriangles = (bytes) => {
  const n = bytes.readUInt32LE(80);
  if (bytes.length !== 84 + n * 50) throw Error(`not a binary STL: ${bytes.length} bytes for ${n} triangles`);
  return n;
};
const selPoint = (app) => app.state(() => window.slotforgeFrame.state.selPoint);
const points = async (app) => (await app.feature('outline')).params.points;
const LIB_FILE = 'input[type=file][accept=".framelib,.json"]';
const STL_FILE = 'input[type=file][accept=".stl"]:not(#bodyfile)';

export const checks = [
  ['the app starts, builds the default design and passes its checks', async (app) => {
    const { page, assert } = app;
    assert.equal(await page.locator('.brand').getAttribute('aria-label'), 'SlotForge Frame');
    assert.equal(await page.locator('#menus [data-act=menu]').count(), 10);
    assert.ok((await page.locator('#topview path.plate').count()) >= 1, 'the top view shows the plate');
    assert.match(await page.locator('#status').innerText(), /All checks pass/);
    assert.deepEqual((await app.notes()).filter((n) => !n.ok && n.title !== 'The chassis is open beside the gear'), []);
    // The 3D view draws something. A picture of one flat colour packs down to almost nothing;
    // a drawn scene does not. Hiding the parts must change the picture.
    await page.click('[data-act=view][data-view="3d"]');
    const shot = await page.locator('#gl canvas').screenshot();
    assert.ok(shot.length > 8000, `the 3D view is not blank (${shot.length} bytes)`);
    await page.click('[data-act=focus][data-focus=pod]');
    const podOnly = await page.locator('#gl canvas').screenshot();
    assert.ok(!shot.equals(podOnly), 'showing only the pod changes the 3D view');
  }],

  ['an outline point can be curved, and made a corner again', async (app) => {
    const { page, assert } = app;
    await app.tool('outline');
    const area = () => app.state(() => window.slotforgeFrame.state.built.chassis.volume);
    const before = await area();
    await page.locator('#panel [data-act=curvepoint][data-i="3"]').click();
    await app.idle();
    assert.equal((await app.feature('outline')).params.points[3][2], 1);
    assert.equal(await page.locator('#panel [data-act=curvepoint][data-i="3"]').getAttribute('aria-pressed'), 'true');
    assert.ok((await area()) < before - 1, 'the corner is rounded off');
    await page.locator('#panel [data-act=curvepoint][data-i="3"]').click();
    await app.idle();
    assert.equal((await app.feature('outline')).params.points[3].length, 2);
    assert.ok(Math.abs((await area()) - before) < 0.01);
    await page.click('#panel [data-act=curveall]');
    await app.idle();
    assert.ok((await app.feature('outline')).params.points.every((q) => q[2] === 1));
    // (Curving the cut-ins for the wheels makes them shallower, so the tyre check may speak up: that is for the user to see.)
    assert.ok((await app.state(() => window.slotforgeFrame.state.error)) === null, 'a fully curved outline builds');
    assert.ok(!(await app.notes()).some((n) => /piece|empty/i.test(n.title) && !n.ok));
  }],

  ['a click straight after typing in a field still lands', async (app) => {
    const { page, assert } = app;
    await app.tool('outline');
    await app.field('thickness').fill('2');
    // No Enter, no Tab: the click itself takes the field's focus away.
    await page.click('[data-act=view][data-view="3d"]');
    await app.idle();
    assert.equal((await app.feature('outline')).params.thickness, 2, 'the typed value was taken');
    assert.equal(await app.state(() => window.slotforgeFrame.state.view), '3d', 'and the click did its work');
    // The same with a button inside the panel that gets re-drawn.
    await page.click('[data-act=view][data-view="top"]');
    const before = (await points(app)).length;
    await app.field('round').fill('0.5');
    await page.click('#panel [data-act=addpoint]');
    await app.idle();
    assert.equal((await app.feature('outline')).params.round, 0.5);
    assert.equal((await points(app)).length, before + 1, 'the point was added by that one click');
  }],

  ['Tab moves to the next field after a change', async (app) => {
    const { page, assert } = app;
    await app.tool('car', 'wheels');
    await app.field('car.wheelbase').fill('85');
    await page.keyboard.press('Tab');
    await app.idle();
    assert.equal((await app.design()).car.wheelbase, 85);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.path), 'car.clearance', 'focus is on the next field');
  }],

  ['undo keeps the chosen outline point in range', async (app) => {
    const { page, assert } = app;
    await app.tool('outline');
    const n = (await points(app)).length;
    // Choose the last point, add one after it, then undo.
    await page.locator(`#panel [data-point="${n - 1}"]`).first().focus();
    assert.equal(await selPoint(app), n - 1);
    await page.click('#panel [data-act=addpoint]');
    await app.idle();
    assert.equal((await points(app)).length, n + 1);
    await page.click('[data-act=undo]');
    await app.idle();
    assert.equal((await points(app)).length, n);
    assert.ok((await selPoint(app)) <= n - 1, 'the chosen point exists');
    assert.match(await page.locator('#panel [data-act=addpoint]').innerText(), new RegExp(`after point ${n}\\b`));
    // And the button still works.
    await page.click('#panel [data-act=addpoint]');
    await app.idle();
    assert.equal((await points(app)).length, n + 1);
    // Redo and undo by keyboard.
    await page.locator('#topview').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await app.idle();
    assert.equal((await points(app)).length, n);
    await page.keyboard.press('Control+y');
    await app.idle();
    assert.equal((await points(app)).length, n + 1);
  }],

  ['an edge wall stays on its edge when outline points are added or removed', async (app) => {
    const { page, assert } = app;
    await app.tool('shape', 'wall');
    await page.click('#panel [data-act=addshape][data-type=wall]');
    await app.idle();
    const wall = (await app.features('wall'))[0].params, pts = await points(app);
    const edge = [pts[wall.from], pts[wall.to]];
    // Add a point early in the outline: every later point moves up one number.
    await app.tool('outline');
    await page.locator('#panel [data-point="2"]').first().focus();
    await page.click('#panel [data-act=addpoint]');
    await app.idle();
    let now = (await app.features('wall'))[0].params, p2 = await points(app);
    assert.deepEqual([now.from, now.to], [wall.from + 1, wall.to + 1]);
    assert.deepEqual([p2[now.from], p2[now.to]], edge, 'still the same two points');
    // Remove it again.
    await page.click('#panel [data-act=delpoint][data-i="3"]');
    await app.idle();
    now = (await app.features('wall'))[0].params;
    p2 = await points(app);
    assert.deepEqual([now.from, now.to], [wall.from, wall.to]);
    assert.deepEqual([p2[now.from], p2[now.to]], edge);
    assert.deepEqual((await app.notes()).filter((n) => !n.ok && n.title !== 'The chassis is open beside the gear'), []);
  }],

  ['Export waits for the build, then writes the parts laid flat', async (app) => {
    const { page, assert } = app;
    const exportPart = async (what) => { await page.click('[data-act=pop][data-pop=export]'); await page.click(`[data-act=export][data-what="${what}"]`); };
    // While a build is running, nothing is written.
    await app.state(() => { window.slotforgeFrame.state.busy = true; });
    assert.deepEqual(await app.downloads(() => exportPart('chassis'), 0), []);
    assert.ok((await app.toasts()).some((t) => /still being built/.test(t)));
    await app.state(() => { window.slotforgeFrame.state.busy = false; });
    // Then each part comes out as one STL whose size matches its triangle count.
    const [chassis] = await app.downloads(() => exportPart('chassis'));
    assert.equal(chassis.name, 'New chassis chassis.stl');
    const built = await app.state(() => { const b = window.slotforgeFrame.state.built; return [b.chassis.indices.length / 3, b.pod.indices.length / 3]; });
    assert.equal(stlTriangles(chassis.bytes), built[0]);
    const both = await app.downloads(() => exportPart('both'), 2);
    assert.deepEqual(both.map((f) => f.name).sort(), ['New chassis chassis.stl', 'New chassis pod.stl']);
    assert.equal(stlTriangles(both.find((f) => /pod/.test(f.name)).bytes), built[1]);
    // Laid flat: the lowest corner of the file is on zero.
    let lowest = Infinity;
    for (let t = 0; t < built[0]; t++) for (let k = 0; k < 3; k++) lowest = Math.min(lowest, chassis.bytes.readFloatLE(84 + t * 50 + 12 + k * 12 + 8));
    assert.ok(Math.abs(lowest) < 1e-4, 'the chassis stands on zero');
  }],

  ['a split chassis is exported as two parts', async (app) => {
    const { page, assert } = app;
    await app.tool('shape', 'split');
    await page.click('#panel input[data-act=toggle]');
    await app.idle();
    assert.ok((await app.notes()).find((n) => n.title === 'The chassis prints in two parts')?.ok);
    assert.equal(await page.locator('#topview .splitline').count(), 1);
    const files = await app.downloads(async () => { await page.click('[data-act=pop][data-pop=export]'); await page.click('[data-act=export][data-what=chassis]'); }, 2);
    assert.deepEqual(files.map((f) => f.name).sort(), ['New chassis chassis front.stl', 'New chassis chassis rear.stl']);
    for (const f of files) assert.ok(stlTriangles(f.bytes) > 200);
    assert.ok((await app.toasts()).some((t) => /in two parts/.test(t)));
  }],

  ['undo does not reach back into another design', async (app) => {
    const { page, assert } = app;
    await app.tool('car', 'wheels');
    await app.set('car.wheelbase', 80);
    assert.equal(await page.locator('[data-act=undo]').isDisabled(), false);
    // New asks first, because the change is not saved to a file. Saying no keeps the design.
    app.answer(false);
    await page.click('[data-act=pop][data-pop=new]');
    await page.click('[data-act=new][data-scale="1/24"]');
    assert.equal((await app.design()).scale, '1/32');
    assert.equal(app.dialogs.length, 1);
    app.answer(true);
    await page.click('[data-act=pop][data-pop=new]');
    await page.click('[data-act=new][data-scale="1/24"]');
    await app.idle();
    assert.equal((await app.design()).scale, '1/24');
    assert.equal(await page.locator('[data-act=undo]').isDisabled(), true, 'nothing to undo in a new design');
    await page.locator('#topview').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal((await app.design()).scale, '1/24', 'Ctrl+Z does not bring the old design back');
    assert.match(await page.locator('#status').innerText(), /^1\/24/);
  }],

  ['a pop-up menu closes when you click elsewhere', async (app) => {
    const { page, assert } = app;
    await page.click('[data-act=pop][data-pop=export]');
    assert.equal(await page.locator('.popmenu').count(), 1);
    await page.click('[data-act=focus][data-focus=pod]');
    assert.equal(await page.locator('.popmenu').count(), 0, 'closed by a click on another button');
    // One click opens it again (it does not need two).
    await page.click('[data-act=pop][data-pop=export]');
    assert.equal(await page.locator('.popmenu').count(), 1);
    await page.locator('#topview').click({ position: { x: 5, y: 5 } });
    assert.equal(await page.locator('.popmenu').count(), 0, 'closed by a click on the drawing');
  }],

  ['handles in the top view can be dragged', async (app) => {
    const { page, assert } = app;
    const drag = async (selector, dx, dy) => {
      const box = await page.locator(selector).boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
      await page.mouse.move(x + dx, y + dy, { steps: 3 });
      await page.mouse.up();
      await app.idle();
    };
    await app.tool('outline');
    const before = (await points(app))[8];
    await drag('#topview [data-drag=point][data-i="8"]', -20, 12);
    const after = (await points(app))[8];
    assert.ok(after[0] < before[0] - 1 && after[1] > before[1] + 0.5, `the point moved (${before} to ${after})`);
    assert.equal(await page.locator('[data-act=undo]').isDisabled(), false, 'one drag is one step to undo');
    await page.click('[data-act=undo]');
    await app.idle();
    assert.deepEqual((await points(app))[8], before);
    // The kick-up's fold line, and a body mount.
    await app.tool('shape', 'kickup');
    const fold = (await app.feature('kickup')).params.fold;
    await drag('#topview [data-drag=line][data-type=kickup]', -25, 0);
    assert.ok((await app.feature('kickup')).params.fold < fold - 2);
    await app.tool('features', 'bodyMounts');
    const post = (await app.feature('bodyMounts')).params.posts[0];
    await drag('#topview [data-drag=post][data-i="0"]', 15, 0);
    assert.ok((await app.feature('bodyMounts')).params.posts[0].along > post.along + 1);
    // A shaping feature's own handle.
    await app.tool('shape', 'rib');
    await page.click('#panel [data-act=addshape][data-type=rib]');
    await app.idle();
    const rib = (await app.features('rib'))[0].params.points[1];
    await drag('#topview [data-drag=shape][data-k=pt][data-i="1"]', 10, -8);
    const moved = (await app.features('rib'))[0].params.points[1];
    assert.ok(moved[0] > rib[0] + 1 && moved[1] < rib[1] - 0.5);
  }],

  ['clicking a part in the top view opens its tool', async (app) => {
    const { page, assert } = app;
    // The guide sits on the centre line, under the dashed line and the guide blade's preview:
    // a click on it must still reach it.
    await page.locator('#topview [data-pick=guide]').first().click();
    assert.equal(await app.state(() => window.slotforgeFrame.state.tool), 'guide');
    assert.match(await page.locator('#panel .cond').first().innerText(), /guide holder/i);
    await page.locator('#topview [data-pick=bodyMounts]').first().click();
    assert.equal(await app.state(() => window.slotforgeFrame.state.tool), 'bodyMounts');
    // The feature list: switch to the pod's tab and open one of its features.
    await page.click('#tabs [data-tab=pod]');
    await page.locator('#steps [data-tool=uprights]').click();
    assert.match(await page.locator('#panel .cond').first().innerText(), /axle uprights/i);
    assert.match(await page.locator('#tabs button.on').innerText(), /Pod/);
  }],

  ['a design is saved to a file and opened again, and survives a restart', async (app) => {
    const { page, assert } = app;
    await page.locator('#name').fill('Round trip');
    await page.locator('#name').press('Enter');
    await app.tool('pod', 'drivetrain');
    await page.click('#panel [data-act=tile][data-v=sidewinder]');
    await app.idle();
    const saved = await app.design();
    const [file] = await app.downloads(() => page.click('[data-act=save]'));
    assert.equal(file.name, 'Round trip.frame');
    assert.match(await page.locator('#top .state').innerText(), /Saved/);
    // A restart brings the same design back (it is kept between sessions).
    await page.reload();
    await app.idle();
    const noIds = (d) => JSON.stringify(d, (k, v) => (k === 'id' ? undefined : v));
    assert.equal(noIds(await app.design()), noIds(saved));
    // Open the file in a fresh app.
    await app.fresh();
    assert.equal((await app.design()).name, 'New chassis');
    await page.setInputFiles('#file', await app.tempFile(file.name, file.bytes));
    await page.waitForFunction(() => window.slotforgeFrame.state.design.name === 'Round trip');
    await app.idle();
    assert.equal(noIds(await app.design()), noIds(saved));
    // A file that is not a design is refused with a message, and nothing changes.
    await page.setInputFiles('#file', await app.tempFile('bad.chassis', Buffer.from('{"format":"something else"}')));
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /not a SlotForge Frame file/.test(t.textContent)));
    assert.equal((await app.design()).name, 'Round trip');
  }],

  ['the library keeps parts, shares them as a file and puts them back into a design', async (app) => {
    const { page, assert } = app;
    await app.tool('pod', 'drivetrain');
    await page.click('#panel [data-act=tile][data-v=anglewinder]');
    await app.idle();
    await page.click('#menus [data-act=library]');
    await page.click('#dialog [data-d=save][data-kind=pod]');
    await page.waitForSelector('#dialog .card2');
    assert.equal(await page.locator('#dialog .card2').count(), 1);
    assert.match(await page.locator('#dialog .detail').innerText(), /anglewinder/i);
    // Rename it, then share it.
    await page.locator('#dialog [data-d=rename]').fill('My angle pod');
    await page.locator('#dialog [data-d=rename]').press('Tab');
    await page.waitForFunction(() => /My angle pod/.test(document.querySelector('#dialog .card2')?.textContent ?? ''));
    const [share] = await app.downloads(() => page.click('#dialog [data-d=export]'));
    assert.equal(share.name, 'My angle pod.framelib');
    const file = JSON.parse(share.bytes.toString());
    assert.equal(file.format, 'slotforge-frame-library');
    assert.equal(file.items.length, 1);
    assert.equal(file.items[0].data.drivetrain.layout, 'anglewinder');
    // Someone else opens that file: the part is added to their library.
    await page.click('#dialog [data-d=close]');
    await app.fresh();
    assert.equal((await app.design()).drivetrain.layout, 'inline');
    await page.click('#menus [data-act=library]');
    assert.equal(await page.locator('#dialog .card2').count(), 0, 'a fresh library is empty');
    await page.setInputFiles(LIB_FILE, await app.tempFile(share.name, share.bytes));
    await page.waitForSelector('#dialog .card2');
    assert.match(await page.locator('#dialog .card2').innerText(), /My angle pod/);
    // Use it: the design takes the pod and its drivetrain.
    await page.click('#dialog [data-d=use]');
    await app.idle();
    assert.equal(await page.locator('#dialog .win').count(), 0, 'the window closes');
    assert.equal((await app.design()).drivetrain.layout, 'anglewinder');
    assert.deepEqual((await app.notes()).filter((n) => !n.ok && n.title !== 'The chassis is open beside the gear'), []);
    // A file that is not a library is refused.
    await page.click('#menus [data-act=library]');
    await page.setInputFiles(LIB_FILE, await app.tempFile('bad.framelib', Buffer.from('nonsense')));
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /not a SlotForge Frame library file/.test(t.textContent)));
    // Delete asks first.
    app.answer(true);
    await page.click('#dialog [data-d=delete]');
    await page.waitForFunction(() => document.querySelectorAll('#dialog .card2').length === 0);
  }],

  ['a pod STL is imported, placed and used; the chassis follows it', async (app) => {
    const { page, assert } = app;
    // Take the app's own pod as the STL to import.
    const [pod] = await app.downloads(async () => { await page.click('[data-act=pop][data-pop=export]'); await page.click('[data-act=export][data-what=pod]'); });
    await page.click('#menus [data-act=importstl]');
    await page.setInputFiles(STL_FILE, await app.tempFile('bought pod.stl', pod.bytes));
    await page.waitForSelector('#dialog [data-d=adduse]:not([disabled])');
    assert.equal(await page.locator('#dialog [data-d=mount]:checked').count(), 4, 'four screw points found and ticked');
    assert.match(await page.locator('#dialog .list .kv').innerText(), /Round holes found\s*4/);
    // Turning it round keeps it readable and still finds the holes.
    await page.click('#dialog [data-d=turn][data-by="180"]');
    await page.waitForSelector('#dialog [data-d=adduse]:not([disabled])');
    assert.equal(await page.locator('#dialog [data-d=mount]:checked').count(), 4);
    await page.click('#dialog [data-d=turn][data-by="180"]');
    await page.waitForSelector('#dialog [data-d=adduse]:not([disabled])');
    await page.click('#dialog [data-d=adduse]');
    await page.waitForFunction(() => !!window.slotforgeFrame.state.design.pod.imported);
    await app.idle();
    const imp = (await app.design()).pod.imported;
    assert.equal(imp.name, 'bought pod');
    assert.equal(imp.mounts.length, 4);
    assert.ok((await app.notes()).find((n) => n.title === 'Pod fits its opening')?.ok);
    assert.match(await page.locator('#top .who .note').innerText(), /Imported pod: bought pod/);
    // Its panel replaces the pod tools, and it is in the library.
    await app.tool('pod', 'drivetrain');
    assert.match(await page.locator('#panel .cond').first().innerText(), /imported pod/i);
    await page.click('#menus [data-act=library]');
    assert.match(await page.locator('#dialog .card2').innerText(), /bought pod/);
    await page.click('#dialog [data-d=close]');
    // It survives a restart, model and all.
    await page.reload();
    await app.idle();
    assert.equal((await app.design()).pod.imported?.name, 'bought pod');
    // Back to a generated pod.
    await app.tool('pod', 'drivetrain');
    await page.click('#panel [data-act=dropimport]');
    await app.idle();
    assert.equal((await app.design()).pod.imported, undefined);
    // A file that is no model is refused.
    await page.click('#menus [data-act=importstl]');
    await page.setInputFiles(STL_FILE, await app.tempFile('letter.stl', Buffer.from('Dear chassis, this is a letter and not a model at all.')));
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /not an STL/.test(t.textContent)));
  }],

  ['an imported chassis can be made editable: its shape becomes the outline', async (app) => {
    const { page, assert } = app;
    // Take the app's own chassis, with a closed plate and no kick-up, as the STL to import.
    await app.tool('fill', 'fill');
    await page.click('#panel [data-act=tile][data-v=closed]');
    await app.idle();
    await app.tool('shape', 'kickup');
    await page.locator('#panel input[type=checkbox][data-act=toggle]').first().uncheck();
    await app.idle();
    const drawn = (await app.feature('outline')).params.points;
    const [file] = await app.downloads(async () => { await page.click('[data-act=pop][data-pop=export]'); await page.click('[data-act=export][data-what=chassis]'); });
    await page.click('#menus [data-act=importstl]');
    await page.setInputFiles(STL_FILE, await app.tempFile('bought chassis.stl', file.bytes));
    await page.waitForSelector('#dialog [data-d=adduse]:not([disabled])');
    await page.click('#dialog [data-d=set][data-key=kind][data-v=chassis]');
    await page.waitForSelector('#dialog [data-d=adduse]:not([disabled])');
    await page.click('#dialog [data-d=adduse]');
    await page.waitForFunction(() => !!window.slotforgeFrame.state.design.chassis.imported);
    await app.idle();
    // As imported it is a fixed shape; "Make it editable" turns it into an outline.
    await app.tool('outline');
    assert.match(await page.locator('#panel .cond').first().innerText(), /imported chassis/i);
    await page.click('#panel [data-act=editimport]');
    await page.waitForFunction(() => !window.slotforgeFrame.state.design.chassis.imported && !window.slotforgeFrame.state.tracing);
    await app.idle();
    const d = await app.design(), pts = (await app.feature('outline')).params.points;
    assert.equal(d.chassis.imported, undefined);
    assert.ok(pts.length >= 6 && pts[0][1] === 0 && pts.at(-1)[1] === 0, `an outline of ${pts.length} points, from nose to tail`);
    // It is the same size as the chassis that was exported: as long, and as wide.
    const len = (q) => Math.max(...q.map((v) => v[0])) - Math.min(...q.map((v) => v[0])), wid = (q) => Math.max(...q.map((v) => v[1]));
    assert.ok(Math.abs(len(pts) - len(drawn)) < 1 && Math.abs(wid(pts) - wid(drawn)) < 0.5, `${len(pts)} × ${wid(pts)} against ${len(drawn)} × ${wid(drawn)}`);
    assert.ok(Math.abs((await app.feature('outline')).params.thickness - 1.5) < 0.11, 'the plate thickness is taken over');
    assert.match(await page.locator('#panel .cond').first().innerText(), /draw the outline/i);
    assert.ok((await app.state(() => window.slotforgeFrame.state.error)) === null, 'and it builds');
    // One step back is the imported chassis again.
    await page.keyboard.press('Control+z');
    await app.idle();
    assert.equal((await app.design()).chassis.imported?.name, 'bought chassis');
  }],

  ['the Anvil link: a chassis file goes out, a body comes in as a ghost', async (app) => {
    const { page, assert } = app;
    await app.tool('body');
    const [out] = await app.downloads(() => page.click('#panel [data-act=toanvil]'));
    assert.equal(out.name, 'New chassis.anvilchassis');
    const file = JSON.parse(out.bytes.toString());
    assert.equal(file.format, 'slotforge-anvil-chassis');
    assert.equal(file.version, 1);
    assert.equal(file.chassis.posts.length, 2);
    assert.ok(stlTriangles(Buffer.from(file.stl, 'base64')) > 1000);
    // A body: a simple open box, 150 x 66 x 35.
    const L = 150, W = 66, H = 35;
    const v = [[0, -W / 2, 0], [L, -W / 2, 0], [L, W / 2, 0], [0, W / 2, 0], [10, -W / 2 + 4, H], [L - 20, -W / 2 + 4, H], [L - 20, W / 2 - 4, H], [10, W / 2 - 4, H]];
    const tris = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]].flatMap((q) => [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]);
    const stl = Buffer.alloc(84 + tris.length * 50);
    stl.writeUInt32LE(tris.length, 80);
    tris.forEach((t, i) => t.forEach((p, k) => v[p].forEach((c, a) => stl.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + a * 4))));
    await page.setInputFiles('#bodyfile', await app.tempFile('Test body.stl', stl));
    await page.waitForFunction(() => !!window.slotforgeFrame.state.design.body);
    await app.idle();
    assert.equal(await page.locator('#topview .bodyghost').count(), 1, 'the body shows in the top view');
    assert.match(await page.locator('#panel').innerText(), /The chassis stays inside the body/);
    assert.match(await page.locator('#panel').innerText(), /The wheels stay inside the body/);
    assert.match(await page.locator('#panel').innerText(), /The body (clears|runs into) the chassis/, 'the 3D check has its row');
    // A quarter turn lays it across the car: the chassis no longer fits. Three more bring it back.
    await page.click('#panel [data-act=bodyquarter]');
    await app.idle();
    assert.equal((await app.design()).body.turn, 90);
    assert.match(await page.locator('#panel').innerText(), /The chassis sticks out of the body/);
    for (let i = 0; i < 3; i++) await page.click('#panel [data-act=bodyquarter]');
    await app.idle();
    assert.equal((await app.design()).body.turn, 0);
    assert.match(await page.locator('#panel').innerText(), /The chassis stays inside the body/);
    assert.equal(await app.field('body.up').inputValue(), '+z');
    // Push it far back: the chassis now sticks out, and the Final check says so.
    await app.set('body.shift', 60);
    assert.match(await page.locator('#panel').innerText(), /The chassis sticks out of the body/);
    assert.match(await page.locator('#status').innerText(), /note/);
    assert.match(await page.locator('#panel').innerText(), /The body runs into the chassis/, 'pushed that far, the body\'s walls cut through the chassis');
    // Hide it, remove it.
    await page.click('[data-act=show][data-show=body]');
    assert.equal(await page.locator('#topview .bodyghost').count(), 0);
    await page.click('#panel [data-act=bodyremove]');
    await app.idle();
    assert.equal((await app.design()).body, undefined);
    assert.match(await page.locator('#status').innerText(), /All checks pass/);
  }],

  ['a body is traced into the chassis outline, and Undo brings the old one back', async (app) => {
    const { page, assert } = app;
    await app.tool('outline', 'trace');
    assert.equal(await page.locator('#panel [data-act=tracebody]').count(), 0, 'nothing to trace without a body');
    // A body: an open box 146 x 62 x 35, narrower than the default chassis is long.
    const L = 146, W = 62, H = 35;
    const v = [[0, -W / 2, 0], [L, -W / 2, 0], [L, W / 2, 0], [0, W / 2, 0], [10, -W / 2 + 4, H], [L - 20, -W / 2 + 4, H], [L - 20, W / 2 - 4, H], [10, W / 2 - 4, H]];
    const tris = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]].flatMap((q) => [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]);
    const stl = Buffer.alloc(84 + tris.length * 50);
    stl.writeUInt32LE(tris.length, 80);
    tris.forEach((t, i) => t.forEach((p, k) => v[p].forEach((c, a) => stl.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + a * 4))));
    await page.setInputFiles('#bodyfile', await app.tempFile('Trace body.stl', stl));
    await page.waitForFunction(() => !!window.slotforgeFrame.state.design.body);
    await app.idle();
    const before = (await app.feature('outline')).params.points;
    // The tool's own settings are not part of the design: changing one is no undo step.
    await app.set('ui.trace.gap', 2);
    assert.deepEqual((await app.feature('outline')).params.points, before);
    assert.equal(await app.state(() => window.slotforgeFrame.state.ui.trace.gap), 2);
    await page.click('#panel [data-act=tracebody]');
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /Outline traced from the body/.test(t.textContent)));
    await app.idle();
    const pts = (await app.feature('outline')).params.points;
    assert.notDeepEqual(pts, before);
    // (The body's walls lean in a little, and the plate keeps clear of that as far up as it reaches: about 0.3 mm more.)
    const reach = Math.max(...pts.map((q) => q[1]));
    assert.ok(reach < 29.01 && reach > 28.4, `the sides sit 2 mm inside the 62 mm body (${reach})`);
    assert.ok(pts.at(-1)[0] - pts[0][0] < 142.2 && pts.at(-1)[0] - pts[0][0] > 139.5, `and so do the bumpers (${pts.at(-1)[0] - pts[0][0]})`);
    // Drawn in at the wheels: at the front axle the plate ends inside the tyre.
    // (the tyre's inner face is 21 mm out; 1 mm of room is left beside it, 1.5 mm ahead of and behind it)
    const well = pts.filter((q) => Math.abs(q[1] - 20) < 0.06).map((q) => q[0]);
    assert.ok(Math.min(...well) < -11 && Math.max(...well) > 11 && Math.max(...well) < 12, `drawn in at the front wheels (${JSON.stringify(pts)})`);
    assert.ok(!pts.some((q) => Math.abs(q[0]) < 11 && q[1] > 20.05), 'nothing of the plate beside the front tyres');
    const notes = await app.notes();
    assert.ok(notes.find((n) => n.title === 'Tyres clear the chassis')?.ok);
    assert.ok((await app.state(() => window.slotforgeFrame.state.error)) === null, 'the traced chassis builds');
    await app.tool('body');
    assert.match(await page.locator('#panel').innerText(), /The chassis stays inside the body/);
    // The other way: the body stands on the chassis, which reaches 1 mm out from under it.
    await app.tool('outline', 'trace');
    await page.locator('#panel [data-path="ui.trace.mode"]').selectOption('under');
    assert.equal(await app.field('ui.trace.gap').count(), 0, 'no gap to set in this mode');
    assert.equal(await app.field('ui.trace.edge').inputValue(), '1.5', 'it follows the lowest 1.5 mm of the body');
    assert.equal(await app.field('ui.trace.band').count(), 0);
    await app.set('ui.trace.extend', 1);
    await page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));
    await page.click('#panel [data-act=tracebody]');
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /Outline traced from the body/.test(t.textContent)));
    await app.idle();
    const under = (await app.feature('outline')).params.points, body = (await app.design()).body;
    assert.ok(Math.abs(Math.max(...under.map((q) => q[1])) - 32) < 0.2, 'the sides lie 1 mm outside the 62 mm body');
    assert.ok(Math.abs(under.at(-1)[0] - under[0][0] - 148) < 0.5, 'and the ends 1 mm beyond its bumpers');
    assert.equal(body.onPlate, true);
    assert.equal(body.lift, 3.5, 'the body is set down on the plate');
    assert.equal((await app.feature('kickup')).enabled, false, 'and the plate is flat: the kick-up is switched off');
    await app.tool('body');
    const panel = await page.locator('#panel').innerText();
    assert.match(panel, /The body stands on the chassis/);
    assert.doesNotMatch(panel, /The chassis sticks out of the body/);
    // Traced inside the body again, the body comes back down over the chassis.
    await app.tool('outline', 'trace');
    await page.locator('#panel [data-path="ui.trace.mode"]').selectOption('inside');
    await page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));
    await page.click('#panel [data-act=tracebody]');
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /Outline traced from the body/.test(t.textContent)));
    await app.idle();
    assert.equal((await app.design()).body.onPlate, false);
    assert.equal((await app.design()).body.lift, 2, 'the body is level with the underside of the chassis again');
    await page.keyboard.press('Control+z');
    await app.idle();
    await page.keyboard.press('Control+z');
    await app.idle();
    assert.equal((await app.design()).body.lift, 2, 'undo puts the body back as well');
    assert.notEqual((await app.feature('kickup')).enabled, false, 'and the kick-up');
    // One step back gives the drawn outline again.
    await page.keyboard.press('Control+z');
    await app.idle();
    assert.deepEqual((await app.feature('outline')).params.points, before);
  }],

  ['the axles are fitted to the wheel arches of a body', async (app) => {
    const { page, assert } = app;
    // A shell 150 x 64 with arches 30 and 100 mm from its nose: 70 apart, against a wheelbase of 83.4.
    const tris = [], quad = (a, b, c, d) => tris.push([a, b, c], [a, c, d]);
    const cuts = [0, 19, 41, 88, 112, 150];
    for (const s of [32, -32]) for (let i = 0; i < 5; i++) { const low = i % 2 ? 14 : 0; quad([cuts[i], s, low], [cuts[i + 1], s, low], [cuts[i + 1], s, 30], [cuts[i], s, 30]); }
    for (const x of [0, 150]) quad([x, -32, 0], [x, 32, 0], [x, 32, 30], [x, -32, 30]);
    quad([20, -26, 36], [120, -26, 36], [120, 26, 36], [20, 26, 36]);
    const stl = Buffer.alloc(84 + tris.length * 50);
    stl.writeUInt32LE(tris.length, 80);
    tris.forEach((t, i) => t.forEach((p, k) => p.forEach((c, n) => stl.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + n * 4))));
    await app.tool('body');
    await page.setInputFiles('#bodyfile', await app.tempFile('Arch body.stl', stl));
    await page.waitForFunction(() => !!window.slotforgeFrame.state.design.body);
    await app.idle();
    assert.match(await page.locator('#panel').innerText(), /The axles are not in the wheel arches/);
    const tail = (await app.feature('outline')).params.points.at(-1)[0];
    await page.click('#panel [data-act=fitarches]');
    await app.idle();
    const d = await app.design();
    assert.ok(Math.abs(d.car.wheelbase - 70) <= 0.6, `the wheelbase follows the arches (${d.car.wheelbase})`);
    assert.ok(Math.abs(d.body.shift - 10) <= 0.6, `the body moves so the front arch is over the front axle (${d.body.shift})`);
    assert.match(await page.locator('#panel').innerText(), /The axles sit in the wheel arches/);
    assert.ok(Math.abs((await app.feature('outline')).params.points.at(-1)[0] - (tail + d.car.wheelbase - 83.4)) < 0.11, 'the rear of the chassis came along');
    assert.ok((await app.state(() => window.slotforgeFrame.state.error)) === null);
    // In 3D the body can be shown solid: it then hides what lies under it.
    assert.equal(await page.locator('[data-act=show][data-show=solid]').count(), 0, 'no Solid switch in the top view');
    await page.click('[data-act=view][data-view="3d"]');
    await page.waitForTimeout(500);
    const ghost = await page.locator('#gl canvas').screenshot();
    await page.click('[data-act=show][data-show=solid]');
    await page.waitForTimeout(500);
    const solid = await page.locator('#gl canvas').screenshot();
    assert.ok(!ghost.equals(solid), 'the picture changes');
    assert.equal(await page.locator('[data-act=show][data-show=solid].on').count(), 1);
    await page.click('[data-act=show][data-show=solid]');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-act=show][data-show=solid].on').count(), 0);
    assert.ok(!solid.equals(await page.locator('#gl canvas').screenshot()), 'and changes back');
    await page.click('[data-act=view][data-view="top"]');
    // One step back undoes both.
    await page.keyboard.press('Control+z');
    await app.idle();
    assert.equal((await app.design()).car.wheelbase, 83.4);
    assert.equal((await app.design()).body.shift, 0);
  }],

  ['the pod can be put on top of the chassis; its motor and axle drop through it', async (app) => {
    const { page, assert } = app;
    await app.tool('pod', 'base');
    assert.equal(await app.field('.drop').count(), 0, 'nothing to drop while the pod sits in its opening');
    await page.locator('#panel input[type=checkbox][data-path$=".onTop"]').check();
    await app.idle();
    const base = (await app.feature('base')).params;
    assert.equal(base.onTop, true);
    assert.equal(base.drop, -1.5, 'the motor and axle go down by the plate\'s thickness');
    assert.equal(await app.field('.drop').inputValue(), '-1.5');
    assert.deepEqual((await app.notes()).filter((n) => !n.ok), [], 'the pod on top builds without faults');
    assert.match(await page.locator('#panel').innerText(), /The chassis rides above the track\s*2\b/i);
    // Leaving the motor and axle where they are in the pod makes the chassis ride lower, and the app offers the way back.
    await app.set('.drop', 0);
    assert.match(await page.locator('#panel').innerText(), /rides 1\.5 mm lower/i);
    await page.click('#panel [data-act=podlevel]');
    await app.idle();
    assert.equal((await app.feature('base')).params.drop, -1.5);
    // Back into its opening: nothing is dropped any more.
    await page.locator('#panel input[type=checkbox][data-path$=".onTop"]').uncheck();
    await app.idle();
    assert.deepEqual([(await app.feature('base')).params.onTop, (await app.feature('base')).params.drop], [false, 0]);
  }],

  ['lengths can be shown and typed in inches; the design stays in millimetres', async (app) => {
    const { page, assert } = app;
    await app.tool('car', 'wheels');
    assert.equal(await app.field('car.wheelbase').inputValue(), '83.4');
    await page.click('#status [data-act=units][data-v=in]');
    await app.idle();
    assert.equal((await app.design()).units, 'in');
    assert.equal(await app.field('car.wheelbase').inputValue(), '3.283', '83.4 mm is 3.283 in');
    assert.match(await page.locator('#status').innerText(), /WHEELBASE\s*3\.283/i);
    assert.match(await page.locator('#topview').textContent(), /wheelbase 3\.283 in/);
    // Typed in inches, kept in millimetres.
    await app.set('car.wheelbase', 3);
    assert.equal((await app.design()).car.wheelbase, 76.2);
    assert.equal(await app.field('car.front.tyreD').inputValue(), '0.768', 'the tyre sizes too');
    await app.tool('outline');
    assert.equal(await page.locator('#panel [data-point="1"]').first().inputValue(), String(Math.round(((await app.feature('outline')).params.points[1][0] / 25.4) * 1000) / 1000), 'and the outline points');
    // The choice travels with the design, and switching back shows millimetres again.
    await page.reload();
    await app.idle();
    assert.equal((await app.design()).units, 'in');
    await page.click('#status [data-act=units][data-v=mm]');
    await app.idle();
    await app.tool('car', 'wheels');
    assert.equal(await app.field('car.wheelbase').inputValue(), '76.2');
  }],

  ['the measuring tool gives the distance between two places in the top view', async (app) => {
    const { page, assert } = app;
    const at = (x, y) => page.evaluate(([cx, cy]) => { const p = new DOMPoint(cx, cy).matrixTransform(document.querySelector('#topview').getScreenCTM()); return [p.x, p.y]; }, [x, y]);
    const tool = await app.state(() => window.slotforgeFrame.state.tool);
    await page.click('#viewbar [data-act=measure]');
    assert.match(await page.locator('#measured').innerText(), /first place/i);
    // From the front axle on the centre line to the rear axle, 30 mm out: 83.4 along, 30 across.
    let [x, y] = await at(0, 0);
    await page.mouse.click(x, y);
    assert.match(await page.locator('#measured').innerText(), /second place/i);
    [x, y] = await at(83.4, 30);
    await page.mouse.click(x, y);
    const text = await page.locator('#measured').innerText();
    // (A click lands on a whole pixel, so allow a tenth or two either way.)
    const m = /^([\d.]+) mm · along ([\d.]+) · across ([\d.]+)$/i.exec(text.trim());
    assert.ok(m && Math.abs(+m[1] - 88.63) < 0.3 && Math.abs(+m[2] - 83.4) < 0.3 && Math.abs(+m[3] - 30) < 0.3, text);
    assert.match(await page.locator('#topview .measure').textContent(), /88\.\d/);
    assert.equal(await app.state(() => window.slotforgeFrame.state.tool), tool, 'measuring does not pick tools');
    // A third click starts again; switching the tool off clears it.
    await page.mouse.click(x, y);
    assert.match(await page.locator('#measured').innerText(), /second place/i);
    await page.click('#viewbar [data-act=measure]');
    assert.equal(await page.locator('#topview .measure').count(), 0);
    assert.equal(await page.locator('#measured').count(), 0);
  }],

  ['the Light / Dark switch works and is remembered', async (app) => {
    const { page, assert } = app;
    assert.equal(await page.evaluate(() => document.documentElement.dataset.tone), 'dark');
    await page.click('[data-act=tone][data-tone=light]');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.tone), 'light');
    assert.equal(await page.locator('[data-act=tone][data-tone=light]').getAttribute('aria-pressed'), 'true');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.reload();
    await app.idle();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.tone), 'light', 'remembered after a restart');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), bg);
    await page.click('[data-act=tone][data-tone=dark]');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), bg);
  }],

  ['components: built-in ones are listed, your own are made, edited, used and shared', async (app) => {
    const { page, assert } = app;
    const rows = () => page.locator('#dialog .plist .prow').count();
    // The Drivetrain panel leads to the motors.
    await app.tool('pod', 'drivetrain');
    await page.click('#panel [data-act=library][data-kind=motor]');
    await page.waitForSelector('#dialog .plist .prow');
    assert.equal(await rows(), 7, 'seven built-in motors');
    assert.match(await page.locator('#dialog .detail').innerText(), /built in/i);
    assert.equal(await page.locator('#dialog [data-d=delete]').isDisabled(), true, 'a built-in entry cannot be deleted');
    assert.equal(await page.locator('#dialog [data-d=cfield]').count(), 0, 'or edited');
    // Duplicate the long can and change the copy.
    await page.locator('#dialog .plist .prow', { hasText: 'Long can' }).click();
    await page.click('#dialog [data-d=dup]');
    await page.waitForFunction(() => document.querySelectorAll('#dialog .plist .prow').length === 8);
    assert.match(await page.locator('#dialog .plist .prow.cur').innerText(), /Long can \(FK-180[^)]*\) \(copy\)[\s\S]*Yours[\s\S]*Unconfirmed/);
    await page.locator('#dialog [data-d=cname]').fill('Club long can');
    await page.locator('#dialog [data-d=cname]').press('Tab');
    await page.waitForFunction(() => /Club long can/.test(document.querySelector('#dialog .plist .prow.cur')?.textContent ?? ''));
    await page.locator('#dialog [data-d=cfield][data-key=length]').fill('30');
    await page.locator('#dialog [data-d=cfield][data-key=length]').press('Tab');
    await page.waitForFunction(() => /30 × 20\.4/.test(document.querySelector('#dialog .plist .prow.cur')?.textContent ?? ''));
    // A number outside the limits is pulled back in.
    await page.locator('#dialog [data-d=cfield][data-key=shaftD]').fill('99');
    await page.locator('#dialog [data-d=cfield][data-key=shaftD]').press('Tab');
    await page.waitForFunction(() => document.querySelector('#dialog [data-d=cfield][data-key=shaftD]')?.value === '6');
    await page.click('#dialog [data-d=cconfirm]');
    await page.waitForFunction(() => !/Unconfirmed/.test(document.querySelector('#dialog .plist .prow.cur')?.textContent ?? ''));
    // Use it: the design takes a copy and the pod is rebuilt around it.
    await page.click('#dialog [data-d=use]');
    await app.idle();
    const d = await app.design(), id = d.drivetrain.motor;
    assert.equal(d.custom.motor[id].name, 'Club long can');
    assert.equal(d.custom.motor[id].length, 30);
    assert.match(await page.locator('#top .who .note').innerText(), /Club long can/);
    assert.match(await page.locator('#panel [data-path="drivetrain.motor"]').innerText(), /Club long can · 30 × 20\.4 × 15\.4/);
    // It survives a restart inside the design.
    await page.reload();
    await app.idle();
    assert.equal((await app.design()).custom.motor[id].length, 30);
    // Share the motor on its own, and the pod that uses it.
    await page.click('#menus [data-act=library]');
    await page.click('#dialog [data-d=kind][data-kind=motor]');
    await page.locator('#dialog .plist .prow', { hasText: 'Club long can' }).click();
    const [motorFile] = await app.downloads(() => page.click('#dialog [data-d=export]'));
    assert.equal(motorFile.name, 'Club long can.framelib');
    assert.equal(JSON.parse(motorFile.bytes.toString()).items[0].kind, 'motor');
    await page.click('#dialog [data-d=save][data-kind=pod]');
    await page.waitForSelector('#dialog .card2');
    const [podFile] = await app.downloads(() => page.click('#dialog [data-d=export]'));
    assert.equal(JSON.parse(podFile.bytes.toString()).items[0].data.custom.motor[id].length, 30, 'the pod brings its motor along');
    // Someone else: the pod arrives with its motor, without the motor being in their library.
    await page.click('#dialog [data-d=close]');
    await app.fresh();
    await page.click('#menus [data-act=library]');
    await page.setInputFiles('input[type=file][accept=".framelib,.json"]', await app.tempFile(podFile.name, podFile.bytes));
    await page.waitForSelector('#dialog .card2');
    await page.click('#dialog [data-d=use]');
    await app.idle();
    const e = await app.design();
    assert.equal(e.custom.motor[e.drivetrain.motor].name, 'Club long can');
    await page.click('#menus [data-act=library]');
    await page.click('#dialog [data-d=kind][data-kind=motor]');
    await page.waitForSelector('#dialog .plist .prow');
    assert.equal(await rows(), 7, 'their motor list is still only the built-in ones');
    // Opening the motor's own file adds it to the list.
    await page.setInputFiles('input[type=file][accept=".framelib,.json"]', await app.tempFile(motorFile.name, motorFile.bytes));
    await page.waitForFunction(() => document.querySelectorAll('#dialog .plist .prow').length === 8);
    await page.click('#dialog [data-d=close]');
  }],

  ['a rule set, a printer and a car preset from the library change the design', async (app) => {
    const { page, assert } = app;
    const use = async (kind, text) => {
      await page.click('#menus [data-act=library]');
      await page.click(`#dialog [data-d=kind][data-kind=${kind}]`);
      await page.locator('#dialog .plist .prow', { hasText: text }).first().click();
      await page.click('#dialog [data-d=use]');
      await app.idle();
    };
    await use('rules', 'BSCRA 1/32 F1');
    assert.deepEqual((await app.design()).rules, { maxWidth: 68, guideLeadMax: 110, minClearance: 0.5 });
    await use('printer', 'PLA+');
    assert.equal((await app.design()).printer.material, 'pla');
    assert.match(await page.locator('#status').innerText(), /PLA\+/);
    // A car preset moves the rear of the chassis with the rear axle, and the design still builds.
    const before = await app.design();
    await use('car', 'Carrera Dodge Charger');
    const after = await app.design();
    assert.equal(after.car.wheelbase, 92.5);
    const tail = (d) => Math.max(...d.chassis.features.find((f) => f.type === 'outline').params.points.map((p) => p[0]));
    assert.ok(Math.abs(tail(after) - tail(before) - (92.5 - 83.4)) < 0.02, 'the tail moved back by the difference');
    assert.deepEqual((await app.notes()).filter((n) => !n.ok && n.title !== 'The chassis is open beside the gear'), []);
    // One undo brings the old car back.
    await page.click('[data-act=undo]');
    await app.idle();
    assert.equal((await app.design()).car.wheelbase, 83.4);
    // A car of another scale gives only its wheelbase; the tyres and the track stay as they were.
    const tyres = (await app.design()).car.rear;
    await use('car', 'Carrera D124 Ford Capri');
    assert.deepEqual((await app.design()).car.rear, tyres);
    await page.click('[data-act=undo]');
    await app.idle();
    // In a design of its own scale, a car brings the tyres and the track its maker publishes.
    app.answer(true);
    await page.click('[data-act=pop][data-pop=new]');
    await page.click('[data-act=new][data-scale="1/24"]');
    await app.idle();
    await use('car', 'BRM Porsche 917K');
    const big = (await app.design()).car;
    assert.deepEqual([big.wheelbase, big.front.tyreD, big.front.tyreW, big.rear.tyreD, big.rear.tyreW], [90, 24.5, 12.5, 26.5, 17]);
    await use('car', 'Carrera D124 Ford Capri');
    assert.deepEqual([(await app.design()).car.front.inOut, (await app.design()).car.rear.inOut], [37.75, 40.5], 'half the track each side');
    app.answer(true);
    await page.click('[data-act=pop][data-pop=new]');
    await page.click('[data-act=new][data-scale="1/32"]');
    await app.idle();
    await use('rules', 'BSCRA 1/32 F1');
    await use('printer', 'PLA+');
    // A guide and a bearing from the built-in lists set their sizes.
    await use('guide', 'Carrera 1/32');
    assert.equal((await app.feature('guide')).params.hole, 4);
    await use('bearing', 'Sloting Plus universal');
    assert.equal((await app.feature('uprights')).params.seat, 4.8);
    // A gear set brings its layout.
    await use('gear', 'NSR sidewinder');
    const dt = (await app.design()).drivetrain;
    assert.equal(dt.layout, 'sidewinder');
    assert.equal(dt.gear, 'nsr-sw-32-11');
    assert.equal(dt.centre, 11.13);
    assert.ok((await app.state(() => window.slotforgeFrame.state.error)) === null);
  }],

  ['the anglewinder angle is set in the Drivetrain panel', async (app) => {
    const { page, assert } = app;
    await app.tool('pod', 'drivetrain');
    assert.equal(await app.field('drivetrain.angle').count(), 0, 'an inline motor has no angle to set');
    await page.click('#panel [data-act=tile][data-v=anglewinder]');
    await app.idle();
    assert.equal(await app.field('drivetrain.angle').inputValue(), '25', 'it starts at the angle the gears are cut for');
    // An anglewinder's gear clears the tyre, so the pod stays on the centre line; the chassis is closed round it.
    assert.equal((await app.feature('base')).params.sideways, 0);
    assert.deepEqual((await app.notes()).filter((n) => !n.ok), [], 'closed round the pod, gear and tyre free: no faults at all');
    // A sidewinder's long gear reaches the tyre: choosing it moves the pod over, and "Move it there" does the same by hand.
    await page.click('#panel [data-act=tile][data-v=sidewinder]');
    await app.idle();
    const moved = (await app.feature('base')).params.sideways;
    assert.ok(moved <= -1 && moved > -1.3, `the pod moved away from the gear (${moved})`);
    assert.ok(!(await app.notes()).some((n) => n.title === 'The gear touches a rear tyre'));
    await app.tool('pod', 'base');
    assert.equal(await page.locator('#panel [data-act=podfit]').count(), 0, 'nothing to suggest: it is where it should be');
    await app.set('sideways', 0);
    assert.ok((await app.notes()).some((n) => n.title === 'The gear touches a rear tyre'), 'back on the centre line the gear runs into the tyre');
    await page.click('#panel [data-act=podfit]');
    await app.idle();
    assert.equal((await app.feature('base')).params.sideways, moved, '"Move it there" puts it back');
    await app.tool('pod', 'drivetrain');
    await page.click('#panel [data-act=tile][data-v=anglewinder]');
    await app.idle();
    assert.equal((await app.design()).drivetrain.angle, null);
    await app.set('drivetrain.angle', 18);
    assert.equal((await app.design()).drivetrain.angle, 18);
    assert.match(await page.locator('#panel').innerText(), /These gears are cut for 25°; the motor is set at 18°/);
    assert.ok((await app.state(() => window.slotforgeFrame.state.error)) === null, 'the pod is rebuilt at the new angle');
    await page.click('[data-act=tool][data-tool=check]');
    assert.match(await page.locator('#panel').innerText(), /Motor angle differs from the gears/);
    // "Follow the gears" puts it back; so does choosing other gears.
    await app.tool('pod', 'drivetrain');
    await page.click('#panel [data-act=gearangle]');
    await app.idle();
    assert.equal((await app.design()).drivetrain.angle, null);
    assert.equal(await app.field('drivetrain.angle').inputValue(), '25');
    await app.set('drivetrain.angle', 30);
    await page.locator('#panel [data-path="drivetrain.gear"]').selectOption('nsr-aw-31-13');
    await app.idle();
    assert.equal(await app.field('drivetrain.angle').inputValue(), '15', 'NSR gears bring their own 15 degrees');
    assert.deepEqual((await app.notes()).filter((n) => !n.ok && n.title !== 'The chassis is open beside the gear'), []);
    // The motor can drive the other rear wheel: gear, motor and pod change sides.
    const gearY = () => app.state(() => +document.querySelector('#topview').innerHTML.length && window.slotforgeFrame.state.built.top.pod.flat().reduce((m, q) => (Math.abs(q[1]) > Math.abs(m) ? q[1] : m), 0));
    const widestRight = await gearY();
    await page.locator('#panel [data-path="drivetrain.drives"]').selectOption('left');
    await app.idle();
    assert.equal((await app.design()).drivetrain.drives, 'left');
    assert.ok(Math.abs((await gearY()) + widestRight) < 0.05, 'the pod reaches out on the other side now');
    assert.deepEqual((await app.notes()).filter((n) => !n.ok && n.title !== 'The chassis is open beside the gear'), []);
    await page.locator('#panel [data-path="drivetrain.drives"]').selectOption('right');
    await app.idle();
    // A value past the limits is pulled back.
    await app.set('drivetrain.angle', 80);
    assert.equal((await app.design()).drivetrain.angle, 45);
  }],

  ['the calibration coupon is shown, exported, and sets the two hole fixes', async (app) => {
    const { page, assert } = app;
    await app.tool('print', 'coupon');
    await page.waitForSelector('#panel [data-act=exportcoupon]:not([disabled])');
    // The picture shows every hole: five sizes, six of each.
    assert.equal(await page.locator('#panel svg circle.hole').count(), 30);
    assert.equal(await page.locator('#panel .crows .crow').count(), 7, 'five rows of upright holes, the bearing seats and the axle slots');
    assert.match(await page.locator('#panel .crows').innerText(), /Guide[\s\S]*Ø3\.7 mm, upright[\s\S]*bearing seat[\s\S]*Ø4\.75 mm, sideways/i);
    const [file] = await app.downloads(() => page.click('#panel [data-act=exportcoupon]'));
    assert.equal(file.name, 'New chassis calibration coupon.stl');
    const tris = stlTriangles(file.bytes);
    assert.ok(tris > 2000);
    let lowest = Infinity, highest = -Infinity;
    for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) { const z = file.bytes.readFloatLE(84 + t * 50 + 12 + k * 12 + 8); lowest = Math.min(lowest, z); highest = Math.max(highest, z); }
    assert.ok(Math.abs(lowest) < 1e-4 && highest > 8 && highest < 16, 'it lies flat, a centimetre or so tall');
    // Saying which column fitted sets the fix, one for each kind of hole.
    await page.click('#panel [data-act=setfix][data-path="printer.holeFix"][data-v="0.3"]');
    await app.idle();
    await page.click('#panel [data-act=setfix][data-path="printer.boreFix"][data-v="0.1"]');
    await app.idle();
    const printer = (await app.design()).printer;
    assert.equal(printer.holeFix, 0.3);
    assert.equal(printer.boreFix, 0.1);
    assert.equal(await page.locator('#panel [data-act=setfix][data-path="printer.holeFix"].on').innerText(), '3');
    assert.equal(await page.locator('#panel [data-act=setfix][data-path="printer.boreFix"].on').innerText(), '1');
    // The Printer panel shows the same two numbers, and the design still builds.
    await app.tool('print', 'printer');
    assert.equal(await app.field('printer.holeFix').inputValue(), '0.3');
    assert.equal(await app.field('printer.boreFix').inputValue(), '0.1');
    assert.deepEqual((await app.notes()).filter((n) => !n.ok && n.title !== 'The chassis is open beside the gear'), []);
    // The coupon follows the design: a new hole size gives a new row.
    await app.tool('pod', 'lugs');
    await app.set('hole', 2.9);
    await app.tool('print', 'coupon');
    await page.waitForFunction(() => document.querySelectorAll('#panel svg circle.hole').length === 30 && /Ø2\.9 mm/.test(document.querySelector('#panel .crows')?.textContent ?? ''));
  }],

  ['wheel inserts: a pattern is picked, layered, drawn, shown in 3D and exported as a set', async (app) => {
    const { page, assert } = app;
    const built = () => page.waitForFunction(() => { const b = window.slotforgeFrame.state.insBuilt; return b?.data && b.key === JSON.stringify([window.slotforgeFrame.state.design.inserts.rear, window.slotforgeFrame.state.design.printer.nozzle, window.slotforgeFrame.state.design.car.axleD]); }, null, { timeout: 30000 });
    const insert = () => page.evaluate(() => JSON.parse(JSON.stringify(window.slotforgeFrame.state.design.inserts)));
    await app.tool('inserts', 'insertRear');
    await built();
    // The face is drawn in the view, layer by layer, with the section through the wheel beside it.
    assert.equal(await page.locator('#topview mask').count(), 2, 'the 5-spoke start has two layers');
    assert.ok(await page.locator('#insec svg').isVisible());
    // A pattern from the panel replaces the layers; the list on the right follows.
    await page.click('#panel [data-act=inspreset][data-p="Mesh"]');
    await built();
    assert.equal((await insert()).rear.layers.length, 3);
    assert.equal(await page.locator('#steps .sp').count(), 3);
    assert.equal(await app.state(() => window.slotforgeFrame.state.insBuilt.data.pieces), 1, 'the mesh insert is one piece');
    // A cup turns printing face down on, a flat disc off again.
    await page.click('#panel [data-act=tile][data-path="inserts.rear.base.form"][data-v=cup]');
    assert.equal((await insert()).rear.faceDown, true);
    await page.click('#panel [data-act=tile][data-path="inserts.rear.base.form"][data-v=disc]');
    assert.equal((await insert()).rear.faceDown, false);
    // A layer is added and changed; only the insert is built again, not the car.
    await app.state(() => { window.builtBefore = window.slotforgeFrame.state.built; });
    await page.click('#panel [data-act=insadd][data-t=holes]');
    await app.set('layers.3.count', 6);
    await built();
    assert.equal((await insert()).rear.layers[3].count, 6);
    assert.equal(await page.locator('#steps .sp.cur .n').innerText(), '4');
    assert.ok(await app.state(() => window.slotforgeFrame.state.built === window.builtBefore), 'the chassis was not rebuilt');
    // Undo takes the layer away again.
    await page.click('[data-act=undo]');
    await page.click('[data-act=undo]');
    await built();
    assert.equal((await insert()).rear.layers.length, 3);
    // A drawn layer: its points have handles in the view, and dragging one moves it.
    await page.click('#panel [data-act=insadd][data-t=draw]');
    await built();
    const handle = page.locator('#topview [data-drag=ipt][data-i="4"]');
    const box = await handle.boundingBox(), was = (await insert()).rear.layers[3].points[4];
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 12, box.y + box.height / 2 - 6, { steps: 4 });
    await page.mouse.up();
    await built();
    assert.notDeepEqual((await insert()).rear.layers[3].points[4], was, 'the point moved');
    // The front can have its own insert.
    await page.click('#sub [data-act=tool][data-tool=insertFront]');
    await page.click('#panel input[data-path="inserts.same"]');
    await page.click('#panel [data-act=inspreset][data-p="8-hole"]');
    const both = await insert();
    assert.equal(both.same, false);
    assert.equal(both.front.layers[0].type, 'holes');
    assert.equal(both.rear.layers[0].type, 'spokes');
    // 3D shows the insert alone; another menu brings the car back.
    await page.click('#viewbar [data-act=view][data-view="3d"]');
    assert.ok(await page.locator('#gl canvas').isVisible());
    await app.tool('pod', 'base');
    assert.equal(await page.locator('#viewbar [data-act=focus]').count(), 3, 'the car view bar is back');
    await page.click('#viewbar [data-act=view][data-view=top]');
    // The set of four comes out as one STL; the calibration ring as another.
    const [set] = await app.downloads(async () => { await page.click('[data-act=pop][data-pop=export]'); await page.click('.popmenu [data-act=exportinserts]'); });
    assert.equal(set.name, 'New chassis wheel inserts.stl');
    assert.ok(stlTriangles(set.bytes) > 500);
    // The calibration ring is made round a middle size you set.
    await app.tool('inserts', 'insertRing');
    await app.set('inserts.ring.centre', 11.6);
    const [ring] = await app.downloads(() => page.click('#panel [data-act=exportring]'));
    assert.equal(ring.name, 'New chassis insert calibration ring.stl');
    assert.equal(await page.locator('#panel [data-act=insring][data-k=rear]').count(), 7);
    // Telling the app which disc fitted sets that size, the same however often it is clicked.
    await page.click('#panel [data-act=insring][data-k=rear] >> nth=4');
    await page.click('#panel [data-act=insring][data-k=rear] >> nth=4');
    const fitted = (await insert()).rear.base;
    assert.equal(fitted.od, 11.65);
    assert.equal(fitted.clear, 0.175);
  }],

  ['rear wings: a wing is picked, changed, given its own endplate, shown in 3D and exported with its template', async (app) => {
    const { page, assert } = app;
    const wing = () => page.evaluate(() => JSON.parse(JSON.stringify(window.slotforgeFrame.state.design.wing)));
    const built = () => page.waitForFunction(() => { const s = window.slotforgeFrame.state, b = s.wingBuilt; return b?.data && b.key === JSON.stringify([s.design.wing, s.design.printer.nozzle, s.design.rules.maxWidth]); }, null, { timeout: 30000 });
    await app.state(() => { window.builtBefore = window.slotforgeFrame.state.built; });
    await app.tool('wings', 'wing');
    await built();
    // Both views are drawn, and the parts are listed on the right.
    assert.ok(await page.locator('#topview #wgside').count(), 'the side view');
    assert.equal(await page.locator('#steps .sp').count(), 4);
    // A ready-made wing, then a size of your own; the chassis is not built again for it.
    await page.click('#panel [data-act=wingpreset][data-p="LMP"]');
    await built();
    assert.equal((await wing()).count, 1);
    await app.set('wing.span', 50);
    await built();
    assert.equal((await wing()).span, 50);
    assert.ok(await app.state(() => window.slotforgeFrame.state.built === window.builtBefore), 'the chassis was not rebuilt');
    assert.equal(await app.state(() => window.slotforgeFrame.state.wingBuilt.data.pieces), 1);
    // Your own endplate: start from the shape, then drag one of its points in the side view.
    await page.click('#sub [data-act=tool][data-tool=wingPlates]');
    await page.click('#panel [data-act=wingownfrom]');
    await built();
    assert.equal((await wing()).plate, 'own');
    const handle = page.locator('#topview [data-drag=wpt][data-i="2"]'), box = await handle.boundingBox(), was = (await wing()).plateOwn[2];
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 - 10, { steps: 4 });
    await page.mouse.up();
    await built();
    assert.notDeepEqual((await wing()).plateOwn[2], was, 'the point moved');
    // Glued instead of melted: no collar to choose.
    await page.click('#sub [data-act=tool][data-tool=wingLegs]');
    await page.click('#panel [data-act=tile][data-path="wing.fix"][data-v=glue]');
    assert.equal((await wing()).fix, 'glue');
    assert.equal(await page.locator('#panel input[data-path="wing.collar"]').count(), 0);
    // 3D shows the wing alone.
    await page.click('#viewbar [data-act=view][data-view="3d"]');
    assert.ok(await page.locator('#gl canvas').isVisible());
    await page.click('#viewbar [data-act=view][data-view=top]');
    // All apart: the wing, its endplates and the leg come out as one file, with the drilling template beside it.
    await page.click('#sub [data-act=tool][data-tool=wingPrint]');
    await page.click('#panel [data-act=tile][data-path="wing.printAs"][data-v=parts]');
    const [file] = await app.downloads(() => page.click('#panel [data-act=exportwing]'));
    assert.equal(file.name, 'New chassis rear wing.stl');
    assert.ok(stlTriangles(file.bytes) > 500);
    assert.ok((await app.toasts()).some((t) => /in 4 parts/.test(t)), 'wing, two endplates and one leg');
    const [template] = await app.downloads(() => page.click('#panel [data-act=exportwingtemplate]'));
    assert.equal(template.name, 'New chassis wing drilling template.stl');
  }],

  ['every tool opens its panel and every shaping tool adds a feature that builds', async (app) => {
    const { page, assert } = app;
    for (const menu of await page.locator('#menus [data-act=menu]').evaluateAll((els) => els.map((e) => e.dataset.menu))) {
      await page.click(`#menus [data-act=menu][data-menu="${menu}"]`);
      for (const tool of await page.locator('#sub [data-act=tool]').evaluateAll((els) => els.map((e) => e.dataset.tool))) {
        await page.click(`#sub [data-act=tool][data-tool="${tool}"]`);
        assert.ok((await page.locator('#panel .cond').first().innerText()).length > 2, `${menu} › ${tool} shows a panel`);
        const add = page.locator(`#panel [data-act=addshape][data-type="${tool}"]`);
        if (await add.count()) {
          await add.click();
          await app.idle();
          assert.equal((await app.features(tool)).length, 1, `${tool} was added`);
        }
      }
    }
    await page.click('[data-act=tool][data-tool=check]');
    assert.equal(await app.state(() => window.slotforgeFrame.state.error), null);
    assert.deepEqual((await app.notes()).filter((n) => !n.ok && !/Lowest point/.test(n.title)), [], 'with one of everything the design still builds cleanly');
    assert.match(await page.locator('#panel .verdict').innerText(), /ready to print|to fix/i);
  }],
];
