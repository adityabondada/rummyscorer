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
- **Firestore:** location `us-central`, which matches the functions region (`us-central1`).

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

## What I could not check

- Nothing here has been run against your project: no account, pool or workflow exists yet.
- The workflows have been checked for syntax, but not run on GitHub.
- The roles for the production account are untested (see above).
- The service worker (offline and install support) is built and its manifest checks out, but I could not
  confirm it activates in the browser I had. Check on the first preview or production deploy: in Chrome,
  DevTools → Application → Service workers and Manifest.
