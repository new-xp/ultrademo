// "Create a company record in Twenty" - sample tutorial video #2.
// Captured against the acmedemo.twenty.com dummy workspace (persistent auth
// profile 'twenty', created via headless email+password login). Script gate
// waived by Sud 2026-07-09 ("don't wait for my approval, generate the
// finalized videos").
//
// Twenty gotchas (scouted live 2026-07-08/09):
// - The RELIABLE edit affordance is the hover pencil: hover a table cell,
//   a [copy][pencil] mini-toolbar appears, click the pencil. Double-clicks
//   are flaky under automation (hover overlays swallow them) and a dblclick
//   at cell center lands on the copy icon.
// - A filled domain field on the record page is a link chip - clicking it
//   opens the URL in a new tab. Never click filled URL fields.
// - Dropdown pickers need an explicit option click (Enter does not select),
//   and options render in a body-level portal; the same text may exist as
//   chips elsewhere (e.g. "Created by: Sam D") - scope the pick to below the
//   picker's search input.
// - Single-clicking a row's name link is swallowed by its hover tooltip
//   overlay; open records via the hover arrow icon -> preview panel -> Open.
// - Table Enter commits a cell AND opens the next row's cell editor
//   (spreadsheet-style) - press Escape after committing.
// - Deletes via right-click context menu (from a FILLED cell) are IMMEDIATE
//   (no confirm dialog) but SOFT: dedupe still sees deleted records ("This
//   record already exists") - reset must permanently destroy via the
//   "Deleted at" filter view.

const BASE = 'https://acmedemo.twenty.com';

// Center of the "+" (add) button in a record-page relation card ("People",
// "Opportunities"): the card header is <div>Title</div> followed by a button
// group - the add button is the last button.
// (plain function - closures do not survive page.evaluate serialization,
// so the title is passed as the evaluate argument)
const relationAddPoint = (h) => {
  // several elements can carry the same text (the left nav has a "People"
  // link too) - the relation card header is the leaf whose surrounding
  // container holds the open/add button group; walk up to 3 ancestors
  const leaves = [...document.querySelectorAll('div,span,h1,h2,h3')].filter(
    (d) => d.textContent.trim() === h && d.children.length === 0 && d.getBoundingClientRect().width > 0,
  );
  for (const leaf of leaves) {
    let node = leaf;
    for (let up = 0; up < 3; up++) {
      node = node.parentElement;
      if (!node) break;
      const buttons = node.querySelectorAll('button');
      if (buttons.length) {
        const r = buttons[buttons.length - 1].getBoundingClientRect();
        return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)};
      }
    }
  }
  return null;
};

export default {
  title: 'Create a company record in Twenty',
  template: 'walkthrough',
  colorScheme: 'light',
  profile: 'twenty',

  setup: async (page) => {
    await page.goto(`${BASE}/objects/companies`, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForSelector('[data-testid^="row-id-"]', {timeout: 60000});
    await page.waitForTimeout(1500);
  },

  scenes: [
    {
      id: 's1-hook',
      script: "This is Twenty, the open source CRM. Let's get a new company into it, with the record properly filled in, in under a minute.",
      durationHint: 7,
    },

    {
      id: 's2-create',
      media: 'clip',
      script: 'Click New Company and just type the name. The record exists the moment you create it. No form, no save button.',
      record: async (page, rec) => {
        await rec.click('button:has-text("New Company"):visible');
        await rec.skipWhile(() => page.waitForFunction(() => document.activeElement?.tagName === 'INPUT', {timeout: 15000}).catch(() => {}));
        await rec.pause(600);
        await page.keyboard.type('Pied Piper', {delay: 95});
        await rec.pause(500);
        await page.keyboard.press('Enter');
        await rec.pause(900);
        await page.keyboard.press('Escape'); // close the side panel so the table is full-width for s3
        await rec.pause(600);
      },
      durationHint: 9,
    },

    {
      id: 's3-domain',
      media: 'clip',
      script: 'Every cell edits in place. Hover, hit the pencil, type the domain. Done.',
      record: async (page, rec) => {
        // hovering a table cell reveals a [copy][pencil] mini-toolbar; the
        // pencil is the reliable edit affordance (a dblclick at cell center
        // lands on the copy icon instead)
        await rec.moveTo('[data-testid^="row-id-"] [data-testid="editable-cell-display-mode"] >> nth=1');
        await rec.pause(600);
        await rec.click('svg.tabler-icon-pencil:visible');
        await rec.skipWhile(() => page.waitForSelector('input[placeholder="URL"]', {timeout: 15000}));
        await rec.pause(400);
        await page.keyboard.type('piedpiper.com', {delay: 85});
        await rec.pause(500);
        await page.keyboard.press('Enter');
        await rec.pause(400);
        await page.keyboard.press('Escape'); // Enter opens the next row's cell editor
        await rec.pause(500);
        // a second Escape clears the cell's soft focus - while a cell is
        // soft-focused, OTHER cells suppress their hover toolbars
        await page.keyboard.press('Escape');
        await rec.pause(500);
      },
      durationHint: 7,
    },

    {
      id: 's4-owner',
      media: 'clip',
      script: 'Relations work the same way. Give the account an owner without leaving the table.',
      record: async (page, rec) => {
        // hop away from the row first so the hover state re-arms cleanly
        await rec.moveTo('button:has-text("Filter"):visible');
        await rec.pause(400);
        await rec.moveTo('[data-testid^="row-id-"] [data-testid="editable-cell-display-mode"] >> nth=3');
        await rec.pause(700);
        await rec.click('svg.tabler-icon-pencil:visible');
        await rec.skipWhile(() => page.waitForSelector('input[placeholder="Search"]:visible', {timeout: 15000}));
        await rec.pause(300);
        await page.keyboard.type('Sam', {delay: 90});
        await rec.pause(800);
        // the page also shows "Sam D" chips in the Created-by column - pick
        // the option that sits inside the picker dropdown (below its search)
        const pt = await page.evaluate(() => {
          const search = [...document.querySelectorAll('input[placeholder="Search"]')].find((i) => i.getBoundingClientRect().width);
          const sr = search.getBoundingClientRect();
          const opt = [...document.querySelectorAll('div')].find((d) => {
            if (d.children.length || d.textContent.trim() !== 'Sam D') return false;
            const r = d.getBoundingClientRect();
            return r.width && r.y > sr.y && r.y < sr.y + 300 && Math.abs(r.x - sr.x) < 250;
          });
          const r = opt.getBoundingClientRect();
          return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)};
        });
        await rec.clickPoint(pt);
        await rec.pause(1100);
      },
      durationHint: 7,
    },

    {
      id: 's5-open',
      media: 'clip',
      script: 'Open the record and you get the full picture. Every field on the left, and a timeline of activity on the right.',
      record: async (page, rec) => {
        // a single click on the name link is swallowed by the hover tooltip
        // overlay - the real affordance is the arrow icon the name cell
        // reveals on hover (opens the preview panel), then the panel's Open
        await rec.moveTo('[data-testid^="row-id-"] [data-testid="editable-cell-display-mode"] >> nth=0');
        await rec.pause(600);
        await rec.click('svg.tabler-icon-arrow-up-right:visible');
        await rec.skipWhile(() => page.waitForSelector('button:has-text("Open"):visible', {timeout: 20000}));
        await rec.pause(1200);
        await rec.click('button:has-text("Open"):visible');
        await rec.skipWhile(() =>
          page
            .waitForURL(/\/object\/company\//, {timeout: 60000, waitUntil: 'domcontentloaded'})
            .then(() => page.waitForSelector('[id^="fields-"][id$="-accountOwner"]', {timeout: 30000}))
            .then(() => page.waitForTimeout(900)),
        );
        await rec.pause(1600);
      },
      durationHint: 8,
    },

    {
      id: 's6-person',
      media: 'clip',
      script: "Now link a contact. Richard doesn't exist in the CRM yet, so Twenty creates him right from the picker, already attached to the company.",
      record: async (page, rec, ctx) => {
        // the relation cards render after the fields - wait until the add
        // point is actually resolvable
        await page.waitForFunction(relationAddPoint, 'People', {timeout: 20000});
        const pt = await page.evaluate(relationAddPoint, 'People');
        await rec.clickPoint(pt);
        await rec.skipWhile(() => page.waitForSelector('input[placeholder="Search"]', {timeout: 15000}));
        await rec.pause(400);
        await page.keyboard.type('Richard Hendricks', {delay: 80});
        await rec.pause(900);
        await rec.click(':text-is("Add New") >> nth=-1');
        await rec.skipWhile(() => page.waitForSelector(':text-is("Richard Hendricks")', {timeout: 20000}).then(() => page.waitForTimeout(600)));
        await rec.pause(1400);
        await page.keyboard.press('Escape'); // close the new person's side panel
        await rec.pause(500);
      },
      durationHint: 10,
    },

    {
      id: 's7-task',
      media: 'clip',
      script: 'Add a follow-up task so nothing slips.',
      record: async (page, rec) => {
        await rec.click('a[data-testid^="tab-"]:has-text("Tasks")');
        await rec.skipWhile(() => page.waitForSelector('button:has-text("New task")', {timeout: 20000}));
        await rec.pause(500);
        await rec.click('button:has-text("New task"):visible');
        await rec.skipWhile(() => page.waitForSelector('input[placeholder="Title"]', {timeout: 15000}));
        await rec.pause(400);
        await page.keyboard.type('Send intro deck to Richard', {delay: 75});
        await rec.pause(500);
        await page.keyboard.press('Enter');
        await rec.pause(1000);
        await page.keyboard.press('Escape'); // close the task side panel
        await rec.pause(600);
      },
      durationHint: 6,
    },

    {
      id: 's8-timeline',
      media: 'clip',
      script: 'And everything you just did is on the timeline. Every field change, logged automatically.',
      record: async (page, rec) => {
        await rec.click('a[data-testid^="tab-"]:has-text("Timeline")');
        await rec.skipWhile(() => page.waitForSelector(':text-is("Pied Piper was created by")', {timeout: 20000}).catch(() => page.waitForTimeout(1500)));
        await rec.pause(2200);
      },
      durationHint: 6,
    },

    {
      id: 's9-outro',
      script: 'From empty row to a working account record, in about a minute. This video was made with Ultrademo. Point your AI at any app and get a narrated walkthrough like this one.',
      prepare: async (page) => {
        await page.goto(`${BASE}/objects/companies`, {waitUntil: 'domcontentloaded', timeout: 90000});
        await page.waitForSelector('a:has-text("Pied Piper")', {timeout: 30000});
        await page.waitForTimeout(1500);
      },
      durationHint: 9,
    },
  ],
};
