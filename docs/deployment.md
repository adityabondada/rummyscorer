# Deployment setup

This is the one-time setup for the GitHub Actions workflows in `.github/workflows/`. Everything here
is a step **you** run, in the Google Cloud and GitHub consoles: it changes IAM and project settings,
which the build agent is not allowed to do.

- **`ci.yml`** runs on every pull request: lint, typecheck, tests, build, the emulator test suites,
  and a Hosting preview.
- **`deploy.yml`** runs when something is merged to `main`: it deploys Hosting, Firestore rules and
  indexes, and (only if `functions/`, `engine/` or `data/` changed) the Cloud Functions.

Nothing is stored as a secret. GitHub proves who it is to Google Cloud with a short-lived token
(Workload Identity Federation), so there are no keys to leak or rotate.

Project: `rummytracker-8eab5` (number `678269735614`). Repository: `adityabondada/rummyscorer`.

## How access is split

Two service accounts, so a pull request can never deploy to production:

| Account          | Can do                                       | Who may use it                            |
| ---------------- | -------------------------------------------- | ----------------------------------------- |
| `github-preview` | manage Hosting preview channels only         | any workflow in this repository           |
| `github-deploy`  | deploy Hosting, rules, indexes and functions | only jobs in the `production` environment |

Preview deploys use your real Firebase project, so a preview talks to real data.

## 1. Google Cloud (run in Cloud Shell, or anywhere `gcloud` is installed)

```bash
gcloud config set project rummytracker-8eab5

# APIs the deploys and the token exchange need
gcloud services enable \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com \
  firestore.googleapis.com cloudfunctions.googleapis.com run.googleapis.com \
  eventarc.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  pubsub.googleapis.com
```

Create the two accounts:

```bash
gcloud iam service-accounts create github-preview --display-name="GitHub Actions: Hosting previews"
gcloud iam service-accounts create github-deploy  --display-name="GitHub Actions: production deploys"
```

Give them roles:

```bash
PROJECT=rummytracker-8eab5
PREVIEW=github-preview@$PROJECT.iam.gserviceaccount.com
DEPLOY=github-deploy@$PROJECT.iam.gserviceaccount.com

# Previews: Hosting only
for ROLE in roles/firebasehosting.admin roles/firebase.viewer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$PREVIEW" --role="$ROLE" --condition=None
done

# Production: Hosting, rules, indexes and functions
for ROLE in roles/firebase.admin roles/cloudfunctions.admin roles/run.admin \
            roles/iam.serviceAccountUser roles/artifactregistry.admin \
            roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$DEPLOY" --role="$ROLE" --condition=None
done
```

> The production roles are a starting set that I have **not** been able to test against your project.
> If the first deploy fails, the error names the permission it was missing; add the matching role and
> re-run. Remove any you find you don't need.

Let GitHub sign in as them. This pool only trusts tokens from this one repository:

```bash
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"

gcloud iam workload-identity-pools providers create-oidc github-actions \
  --location=global --workload-identity-pool=github --display-name="GitHub Actions" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='adityabondada/rummyscorer'"

POOL=projects/678269735614/locations/global/workloadIdentityPools/github

# Previews: any workflow in the repository
gcloud iam service-accounts add-iam-policy-binding $PREVIEW \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/$POOL/attribute.repository/adityabondada/rummyscorer"

# Production: only a job running in the "production" environment
gcloud iam service-accounts add-iam-policy-binding $DEPLOY \
  --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/$POOL/subject/repo:adityabondada/rummyscorer:environment:production"
```

## 2. GitHub: repository variables

Settings → Secrets and variables → Actions → **Variables** → New repository variable. None of these
are secret.

Until `WIF_PROVIDER` exists, the Hosting preview and the Deploy job are skipped rather than failed, so
pull requests and merges to `main` stay green. They switch on by themselves once it is set.

| Name                          | Value                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `WIF_PROVIDER`                | `projects/678269735614/locations/global/workloadIdentityPools/github/providers/github-actions` |
| `WIF_PREVIEW_SERVICE_ACCOUNT` | `github-preview@rummytracker-8eab5.iam.gserviceaccount.com`                                    |
| `WIF_DEPLOY_SERVICE_ACCOUNT`  | `github-deploy@rummytracker-8eab5.iam.gserviceaccount.com`                                     |
| `VITE_FIREBASE_PROJECT_ID`    | `rummytracker-8eab5`                                                                           |
| `VITE_FIREBASE_AUTH_DOMAIN`   | `rummytracker-8eab5.firebaseapp.com`                                                           |
| `VITE_FIREBASE_API_KEY`       | the `apiKey` from the Firebase web app config                                                  |
| `VITE_FIREBASE_APP_ID`        | the `appId` from the Firebase web app config                                                   |

Then Settings → **Environments** → New environment named `production`. You can add yourself as a
required reviewer there if you want to approve each deploy by hand.

## 3. GitHub: protect `main`

Settings → Branches → Add branch protection rule for `main`:

- Require a pull request before merging.
- Require status checks to pass: **Lint, typecheck, test, build** and **Rules, functions and
  end-to-end tests**.
- Optionally restrict who can push, and require the branch to be up to date.

## 4. Firebase console

- **Authentication → Sign-in method:** Google is enabled (done).
- **Authentication → Settings → Authorized domains:** `rummytracker-8eab5.web.app` and
  `rummytracker-8eab5.firebaseapp.com` are there by default. **Preview links use a different address
  for every pull request, and this list has no wildcards, so Google sign-in does not work on previews.**
  They are for checking layout. To try sign-in on one, add its domain by hand.
- **Firestore:** the `(default)` database exists in `nam5` (US multi-region), Standard edition. The
  functions run in `us-central1`, which is inside it, and the Firestore triggers deploy there fine. A
  database's location can never be changed.

## 5. Budget alert (safety net)

Google Cloud console → Billing → Budgets & alerts → Create budget. Pick a small amount (for example
$5 a month) and alert at 50%, 90% and 100%. The project is meant to stay inside the free quotas, so any
alert means something is wrong.

## 6. The first deploy

The very first functions deploy has to switch some Google Cloud services on, which is more than the
deploy account should be allowed to do. Run it once yourself, from a machine where you are logged in to
the Firebase CLI:

```bash
npm ci
npm run build
firebase deploy --project rummytracker-8eab5
```

After that, merging to `main` deploys by itself.

**This was done once by hand on 2 October 2026** (rules, indexes, functions and Hosting), so the live site
is already up at <https://rummytracker-8eab5.web.app>. These are the things that went wrong, in case they
come back:

- **The database has to exist first.** Rules cannot be deployed to a project with no Firestore database.
  Create it in the console (Build, Firestore Database) before the first deploy.
- **"Cannot determine backend specification. Timeout after 10000."** The CLI loads the functions to find
  them and gives up after 10 seconds, which a slow machine can exceed on the first run. Set
  `FUNCTIONS_DISCOVERY_TIMEOUT=60` and retry.
- **"We failed to modify the IAM policy for the project."** On a project's first 2nd-gen deploy the CLI
  grants a few roles to Google's own service accounts, which only exist a minute or so after it enables
  Eventarc and Pub/Sub. Retrying once fixed it. If it persists, the error prints the three `gcloud`
  commands to run as an owner.
- **`functions/package.json` must not list `@rummy/engine` or `@rummy/data`.** Google's build runs
  `npm install` on that file alone, finds no such packages on npm, and fails. They are bundled into
  `lib/index.js` already, and the bundler finds them through the workspace links.
- **Callable functions are only made public when they are created.** An update never changes that, even
  with `invoker: 'public'` in the code. If a callable returns a bare 403 (even to the browser's CORS
  preflight), delete it with `firebase functions:delete <name> --region us-central1` and deploy again; the
  new function is created public. A correct deploy answers an unsigned call with 401, not 403.
- The first deploy also added a cleanup rule that deletes old function build images after a day, to keep
  storage inside the free quota.

## What I could not check

- Nothing here has been run against your project: no account, pool or workflow exists yet.
- The workflows have been checked for syntax, but not run on GitHub.
- The roles for the production account are untested (see above).
- A real sign-in on the live site. The page loads, the rules refuse anonymous reads and writes, and the
  functions answer 401 to an unsigned call, but I did not sign in, because that would create data in your
  project. The first sign-in, league creation and join through the live site are still to be tried by you.
- Google sign-in from a preview link (see section 4: preview addresses are not authorised domains).
