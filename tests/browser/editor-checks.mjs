export const editorChecks = [
  ['editor references, groups and duplicates survive project save/open and undo',async app=>{
    const {page,assert}=app;
    await app.tool('fill','fill');await page.click('[data-act=tile][data-v=closed]');await app.idle();
    await app.tool('features','wire');await page.click('[data-act=addshape][data-type=wire]');await app.idle();
    await app.set('side',24);
    await page.locator('[data-editor-ref]').selectOption('rear');
    await page.locator('[data-editor-offset]').fill('-40');await page.locator('[data-editor-offset]').press('Tab');await app.idle();
    await app.tool('car','wheels');await app.set('car.wheelbase',100);assert.equal((await app.features('wire'))[0].params.along,60);
    await app.tool('car','rules');await app.set('rules.guideLeadMax',130);
    await app.tool('features','arrange');await page.locator('[data-editor-check]').check();
    await page.locator('#editor-dx').fill('8');await page.click('[data-act=editorop][data-op=copy]');await app.idle();
    assert.deepEqual((await app.features('wire')).map(f=>f.params.along),[60,68]);
    await page.click('[data-act=undo]');await app.idle();assert.equal((await app.features('wire')).length,1);
    await page.click('[data-act=redo]');await app.idle();assert.equal((await app.features('wire')).length,2);
    for(const checkbox of await page.locator('[data-editor-check]').all())await checkbox.check();
    await page.locator('#editor-group-name').fill('Rear cable guides');await page.click('[data-act=editorop][data-op=group]');await app.idle();
    assert.deepEqual((await app.notes()).filter(n=>!n.ok&&n.title!=='The chassis is open beside the gear'),[]);
    const group=(await app.features('wire'))[0].editor.group;assert.ok(group);assert.equal((await app.features('wire'))[1].editor.group,group);
    await page.locator('#panel').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'test-results/editor-groups.png'});
    const [file]=await app.downloads(()=>page.click('[data-act=save]'));const parsed=JSON.parse(file.bytes.toString());assert.equal(parsed.chassis.features.filter(f=>f.editor?.group===group).length,2);
    const oldId=(await app.features('wire'))[0].id;const path=await app.tempFile('editor-roundtrip.frame',file.bytes);await page.locator('#file').setInputFiles(path);await page.waitForFunction(id=>window.slotforgeFrame.state.design.chassis.features.find(f=>f.type==='wire')?.id!==id,oldId);await app.idle();
    const loaded=await app.features('wire');assert.equal(loaded.length,2);assert.equal(loaded[0].editor.group,loaded[1].editor.group);assert.equal(loaded[0].editor.anchor.reference,'rear');
    await app.tool('features','arrange');await page.click('[data-act=editorgroupselect]');await page.locator('#editor-dx').fill('-5');await page.click('[data-act=editorop][data-op=move]');await app.idle();assert.deepEqual((await app.features('wire')).map(f=>f.params.along),[55,63]);
  }],
  ['editor direct 3D selection and drag create one undoable edit',async app=>{
    const {page,assert}=app;await page.click('[data-act=view][data-view="3d"]');
    const click=await page.evaluate(()=>{const s=window.slotforgeFrame.state,g=s.design.chassis.features.find(f=>f.type==='guide').params;return window.slotforgeFrame.projectPoint([g.along-g.bossD/2,g.side,s.design.car.clearance+3]);});
    await page.mouse.click(click.x,click.y);await page.waitForFunction(()=>window.slotforgeFrame.state.tool==='guide');
    await page.locator('[data-editor-ref]').selectOption('front');await app.idle();
    const before=(await app.feature('guide')).params.along;
    const points=await page.evaluate(()=>{const s=window.slotforgeFrame.state,g=s.design.chassis.features.find(f=>f.type==='guide').params,t=s.design.chassis.features.find(f=>f.type==='outline').params.thickness,z=s.design.car.clearance+(t+g.bossH)/2;return [window.slotforgeFrame.projectPoint([g.along+g.bossD/2+5,g.side,z]),window.slotforgeFrame.projectPoint([g.along+g.bossD/2+10,g.side,z])];});
    await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:8});await page.mouse.up();await app.idle();
    assert.ok(Math.abs((await app.feature('guide')).params.along-before-5)<.2);
    await page.screenshot({path:'test-results/editor-selection.png'});
    await page.click('[data-act=undo]');await app.idle();assert.equal((await app.feature('guide')).params.along,before);
  }],
  ['editor clearance uses solids, supports section views and invalidates stale results',async app=>{
    const {page,assert}=app;await app.tool('print','inspect');await page.click('[data-act=editorinspect]');
    await page.waitForFunction(()=>!!window.slotforgeFrame.state.inspection.result);
    assert.ok((await app.state(()=>window.slotforgeFrame.state.inspection.result.overlap))<.5);
    await page.locator('[data-inspect=axis]').selectOption('y');await page.locator('[data-inspect=at]').fill('0');await page.locator('[data-inspect=at]').press('Tab');
    await page.locator('#panel').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'test-results/editor-section.png'});
    await page.locator('[data-inspect=axis]').selectOption('');await page.locator('[data-inspect=pointMode]').check();
    const clicks=await page.evaluate(()=>[[-19,0,8],[90,0,3]].map(p=>window.slotforgeFrame.projectPoint(p)));
    for(const p of clicks)await page.mouse.click(p.x,p.y);
    assert.ok(await app.state(()=>window.slotforgeFrame.state.inspection.distance>0));
    await app.tool('car','wheels');await app.set('car.wheelbase',90);
    assert.equal(await app.state(()=>window.slotforgeFrame.state.inspection.result),null);
    await app.tool('print','inspect');assert.match(await page.locator('[data-clearance-result]').innerText(),/No current/);
  }],
];
