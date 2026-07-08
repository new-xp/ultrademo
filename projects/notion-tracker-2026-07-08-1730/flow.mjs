// Ultrademo flow: "Create a simple project management tracker in Notion"
// Tutorial template (~1:55). Phase A gate test: first flow through the auth
// handoff (profile: 'notion') against a third-party app.
// Script: Projects/Ultrademo/product/2026-07-08-notion-demo-script-outline.md
//
// Reset between takes: node capture/reset-notion-demo.mjs
// (trashes the "Project Tracker" page + database the demo creates)

const HOME = 'https://app.notion.com/p/978f50a1b2c644d886050c1c092b4ff5'; // Notion Home
const STAGE = 'https://app.notion.com/p/39787baed58180b0933ddadc5bdce66f'; // Demo Stage anchor

export default {
  title: 'Notion - build a project tracker',
  template: 'walkthrough',
  colorScheme: 'light',
  profile: 'notion',
  scenes: [
    {
      id: 's1-open',
      prepare: async (page) => {
        await page.goto(HOME);
      },
      settleMs: 2500,
      durationHint: 10,
      script:
        'You don’t need a template or a paid tool to track your projects. Notion’s free plan can build you a working project tracker in about two minutes. Here’s the whole thing, from a blank page.',
    },
    {
      id: 's2-page',
      media: 'clip',
      settleMs: 800,
      record: async (page, rec, ctx) => {
        await rec.moveTo('nav >> text=Private'); // the + is hover-revealed
        await rec.pause(500);
        await rec.click('[aria-label="Add a page"]');
        await rec.pause(1800);
        await page.keyboard.type('Project Tracker', {delay: 90});
        await rec.pause(900);
        ctx.trackerUrl = page.url();
      },
      script: 'Start with a fresh page and give it a name.',
    },
    {
      id: 's3-database',
      media: 'clip',
      settleMs: 600,
      record: async (page, rec) => {
        await rec.click('.notion-frame >> text=Database');
        await rec.pause(1600); // let the picker (with Notion's suggested templates) read
        await rec.click('.notion-overlay-container >> text=Empty database');
        await rec.pause(1800);
      },
      script:
        'Now the key move: turn the page into a database. Notion will offer ready-made templates here, but we’ll start from empty so you see how it actually works.',
    },
    {
      id: 's4-status',
      media: 'clip',
      settleMs: 500,
      record: async (page, rec) => {
        await rec.click('.notion-frame >> text=Add property');
        await rec.pause(900);
        await rec.click('.notion-overlay-container >> :text-is("Status")');
        await rec.pause(1400);
        await page.keyboard.press('Escape');
        await rec.pause(400);
        await page.keyboard.press('Escape');
        await rec.pause(500);
      },
      script:
        'A tracker lives and dies by status. Add a property and choose Status. Notion sets up Not started, In progress, and Done for you.',
    },
    {
      id: 's5-props',
      media: 'clip',
      settleMs: 400,
      record: async (page, rec) => {
        // after the first extra property, the "+ Add property" text control
        // collapses; the reliable path is the column menu's "Insert right"
        await rec.click('.notion-frame >> :text-is("Status")');
        await rec.pause(800);
        await rec.click('.notion-overlay-container >> :text-is("Insert right")');
        await rec.pause(900);
        await rec.click('.notion-overlay-container >> :text-is("Date")');
        await rec.pause(1100);
        await page.keyboard.press('Escape');
        await rec.pause(300);
        await page.keyboard.press('Escape');
        await rec.pause(500);
        await rec.click('.notion-frame >> :text-is("Date")');
        await rec.pause(800);
        await rec.click('.notion-overlay-container >> :text-is("Insert right")');
        await rec.pause(900);
        await rec.click('.notion-overlay-container >> :text-is("Person")');
        await rec.pause(1100);
        await page.keyboard.press('Escape');
        await rec.pause(300);
        await page.keyboard.press('Escape');
        await rec.pause(500);
      },
      script:
        'Add a Date property for deadlines, and a Person property so every task has an owner. That’s the whole schema: what, when, who, and how far along.',
    },
    {
      id: 's6-tasks',
      media: 'clip',
      settleMs: 400,
      record: async (page, rec) => {
        const tasks = ['Design landing page', 'Write launch post', 'Set up analytics'];
        for (const t of tasks) {
          await rec.click('.notion-frame >> text=New page');
          await rec.pause(500);
          await page.keyboard.type(t, {delay: 55});
          await rec.pause(300);
          await page.keyboard.press('Escape');
          await rec.pause(500);
        }
        await rec.pause(600);
      },
      script:
        'Now fill it in. Click New page, type the task, hit enter. Add each task the same way, and the tracker starts filling up.',
    },
    {
      id: 's7-status-set',
      media: 'clip',
      settleMs: 400,
      record: async (page, rec) => {
        await rec.click('.notion-frame >> :text-is("Not started")');
        await rec.pause(800);
        await rec.click('.notion-overlay-container >> :text-is("In progress")');
        await rec.pause(700);
        await page.keyboard.press('Escape');
        await rec.pause(500);
        await rec.click('.notion-frame >> :text-is("Not started")');
        await rec.pause(800);
        await rec.click('.notion-overlay-container >> :text-is("Done")');
        await rec.pause(700);
        await page.keyboard.press('Escape');
        await rec.pause(500);
      },
      script: 'Click any status to update it as work moves.',
    },
    {
      id: 's8-board',
      media: 'clip',
      prepare: async (page) => {
        // hover-reveals (the view bar's +) refuse to fire mid-editing-session;
        // an unrecorded reload settles the page before the clip starts
        await page.reload();
        await page.waitForTimeout(3000);
      },
      settleMs: 800,
      record: async (page, rec) => {
        await rec.moveTo('.notion-frame >> :text-is("Table")');
        await rec.pause(700);
        await rec.click('[aria-label="Add view"]');
        await rec.pause(900);
        await rec.click('.notion-overlay-container >> :text-is("Board")');
        await rec.pause(2000);
        await page.keyboard.press('Escape');
        await rec.pause(400);
        // park the cursor on neutral ground so no hover tooltip sits in the freeze frame
        await rec.moveTo('.notion-frame >> :text-is("Project Tracker")');
        await rec.pause(500);
      },
      script:
        'Here’s the payoff. Add a view and pick Board. Notion turns the same tasks into a kanban, grouped by status automatically. Same data, two ways to work it.',
    },
    {
      id: 's9-drag',
      media: 'clip',
      settleMs: 500,
      record: async (page, rec) => {
        // experimental: drag a card between kanban columns; moveTo logs the
        // cursor track, so drag = moveTo card, mouse down, moveTo target, up
        await rec.moveTo('.notion-frame >> text=Set up analytics');
        await rec.pause(300);
        await page.mouse.down();
        await rec.pause(250);
        await rec.moveTo('.notion-frame >> :text-is("In progress")');
        await rec.pause(250);
        await page.mouse.up();
        await rec.pause(1500);
      },
      script: 'And the board is live. Drag a card, and the status updates everywhere.',
    },
    {
      id: 's10-outro',
      settleMs: 800,
      target: '.notion-frame >> :text-is("In progress")',
      action: 'none',
      zoom: 1.12,
      script:
        'That’s a working project tracker: a table for planning, a board for doing, built from scratch in two minutes.',
    },
  ],
};
