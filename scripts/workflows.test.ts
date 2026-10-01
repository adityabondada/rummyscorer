import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

// The workflows can't be run without the real GitHub and Google Cloud projects, so these tests check
// the properties that would otherwise go wrong quietly: wiring between jobs, which account does
// what, and that everything the workflows read is documented.

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  if?: string;
  environment?: string;
  permissions?: Record<string, string>;
  steps: Step[];
  outputs?: Record<string, string>;
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group: string; 'cancel-in-progress'?: boolean };
  jobs: Record<string, Job>;
}

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const load = (file: string): { text: string; wf: Workflow } => {
  const text = read(`.github/workflows/${file}`);
  return { text, wf: parse(text) as Workflow };
};

const ci = load('ci.yml');
const deploy = load('deploy.yml');
const docs = read('docs/deployment.md');
const both = [
  ['ci.yml', ci],
  ['deploy.yml', deploy],
] as const;

const needsOf = (job: Job) => (job.needs === undefined ? [] : [job.needs].flat());
const stepText = (job: Job) => JSON.stringify(job.steps);
const usesAuth = (job: Job) =>
  job.steps.some((s) => s.uses?.startsWith('google-github-actions/auth@'));

describe('triggers', () => {
  it('CI runs on pull requests and nothing else', () => {
    expect(Object.keys(ci.wf.on)).toEqual(['pull_request']);
  });

  it('deploys run only for pushes to main', () => {
    expect(Object.keys(deploy.wf.on)).toEqual(['push']);
    expect(deploy.wf.on.push).toEqual({ branches: ['main'] });
  });

  it('a deploy is never cancelled halfway, but a superseded CI run is', () => {
    expect(deploy.wf.concurrency?.['cancel-in-progress']).toBe(false);
    expect(ci.wf.concurrency?.['cancel-in-progress']).toBe(true);
  });
});

describe.each(both)('%s', (_name, { wf, text }) => {
  it('only needs jobs that exist', () => {
    for (const [name, job] of Object.entries(wf.jobs)) {
      for (const need of needsOf(job))
        expect(wf.jobs, `${name} needs ${need}`).toHaveProperty(need);
    }
  });

  it('stores no secrets: access comes from short-lived tokens', () => {
    expect(text).not.toMatch(/secrets\./);
    expect(text).not.toMatch(/credentials_json|service_account_key|FIREBASE_TOKEN/i);
  });

  it('starts with read-only access to the repository', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  it('only asks for a token where it signs in to Google Cloud', () => {
    for (const [name, job] of Object.entries(wf.jobs)) {
      const wantsToken = job.permissions?.['id-token'] === 'write';
      expect(wantsToken, `${name}: id-token only on jobs that sign in`).toBe(usesAuth(job));
    }
  });

  it('uses every variable it reads from the documented list', () => {
    const used = new Set([...text.matchAll(/\$\{\{\s*vars\.(\w+)\s*\}\}/g)].map((m) => m[1]!));
    expect(used.size).toBeGreaterThan(0);
    for (const name of used)
      expect(docs, `${name} is in docs/deployment.md`).toContain(`\`${name}\``);
  });

  it('pins actions to a version', () => {
    for (const job of Object.values(wf.jobs)) {
      for (const step of job.steps) {
        if (step.uses) expect(step.uses).toMatch(/@v\d+$/);
      }
    }
  });
});

describe('CI jobs', () => {
  const { check, emulators, preview } = ci.wf.jobs as Record<string, Job>;

  it('checks lint, formatting, types, tests and the build', () => {
    const runs = check!.steps.map((s) => s.run ?? '');
    for (const command of [
      'npm ci',
      'npm run lint',
      'npm run format:check',
      'npm run typecheck',
      'npm test',
      'npm run build',
    ]) {
      expect(runs, command).toContain(command);
    }
  });

  it('runs the emulator suites with Java and the Firebase CLI', () => {
    expect(emulators!.steps.some((s) => s.uses?.startsWith('actions/setup-java@'))).toBe(true);
    const runs = emulators!.steps.map((s) => s.run ?? '');
    expect(runs).toContain('npm run test:emulator');
    expect(runs).toContain('npm run test:e2e');
    expect(runs.some((r) => r.includes('firebase-tools'))).toBe(true);
  });

  it('previews only after the checks pass, and never for pull requests from forks', () => {
    expect(needsOf(preview!)).toContain('check');
    expect(preview!.if).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    );
  });

  it('previews as the account that can only manage previews, and never touches production', () => {
    const text = stepText(preview!);
    expect(text).toContain('WIF_PREVIEW_SERVICE_ACCOUNT');
    expect(text).not.toContain('WIF_DEPLOY_SERVICE_ACCOUNT');
    expect(text).toContain('hosting:channel:deploy');
    expect(text).toContain('--expires');
    expect(text).not.toMatch(/firebase deploy/);
    expect(preview!.environment).toBeUndefined();
  });

  it('builds the web app with the Firebase settings before deploying a preview', () => {
    const build = preview!.steps.find((s) => s.run === 'npm run build --workspace web')!;
    expect(Object.keys(build.env ?? {}).sort()).toEqual([
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_APP_ID',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
    ]);
  });
});

describe('deploy jobs', () => {
  const { changes, check, deploy: job } = deploy.wf.jobs as Record<string, Job>;
  const steps = job!.steps;
  const index = (needle: string) => steps.findIndex((s) => (s.run ?? '').includes(needle));

  it('checks the code before deploying it', () => {
    expect(needsOf(job!)).toEqual(expect.arrayContaining(['check', 'changes']));
    expect(check!.steps.map((s) => s.run ?? '')).toEqual(
      expect.arrayContaining(['npm run lint', 'npm run typecheck', 'npm test']),
    );
  });

  it('deploys as the production account, from the production environment only', () => {
    expect(job!.environment).toBe('production');
    const text = stepText(job!);
    expect(text).toContain('WIF_DEPLOY_SERVICE_ACCOUNT');
    expect(text).not.toContain('WIF_PREVIEW_SERVICE_ACCOUNT');
  });

  it('deploys rules, indexes and hosting every time, and rules before functions', () => {
    const all = index('firebase deploy --only firestore:rules,firestore:indexes,hosting');
    const functions = index('firebase deploy --only functions');
    expect(all).toBeGreaterThan(-1);
    expect(functions).toBeGreaterThan(all);
    expect(steps[all]!.if).toBeUndefined();
  });

  it('deploys functions only when something they are built from changed', () => {
    const functions = steps[index('firebase deploy --only functions')]!;
    expect(functions.if).toBe("needs.changes.outputs.functions == 'true'");
    expect(changes!.outputs?.functions).toContain('steps.filter.outputs.functions');

    const filter = changes!.steps.find((s) => s.uses?.startsWith('dorny/paths-filter@'))!;
    const paths = parse(String(filter.with?.filters)) as { functions: string[] };
    for (const dir of ['functions/**', 'engine/**', 'data/**'])
      expect(paths.functions).toContain(dir);
  });

  it('builds the web app with the Firebase settings before deploying', () => {
    const build = index('npm run build --workspace web');
    const deployStep = index('firebase deploy --only firestore');
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(deployStep);
  });

  it('never prompts, since nobody is there to answer', () => {
    for (const step of steps.filter((s) => (s.run ?? '').includes('firebase deploy'))) {
      expect(step.run).toContain('--non-interactive');
    }
  });
});

describe('deployment guide', () => {
  it('tells you to set every variable and to create the production environment', () => {
    for (const name of [
      'WIF_PROVIDER',
      'WIF_PREVIEW_SERVICE_ACCOUNT',
      'WIF_DEPLOY_SERVICE_ACCOUNT',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_APP_ID',
    ]) {
      expect(docs, name).toContain(`\`${name}\``);
    }
    expect(docs).toContain('production');
  });

  it('binds the production account to the production environment of this repository only', () => {
    expect(docs).toContain('repo:adityabondada/rummytracker:environment:production');
    expect(docs).toContain("assertion.repository=='adityabondada/rummytracker'");
  });

  it('matches the project and region the app uses', () => {
    const firebaserc = JSON.parse(read('.firebaserc')) as { projects: { default: string } };
    expect(docs).toContain(firebaserc.projects.default);
    expect(read('functions/src/index.ts')).toContain("region: 'us-central1'");
  });
});
