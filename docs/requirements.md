# Rummy Score Tracker — Requirements

## Overview and platform

A mobile-first web app to track weekend pool Rummy games among friends: scores per round, eliminations, bets, settlement, and long-term stats.

- **Game format:** pool Rummy. Scores are penalty points; lower is better. A player is out once their total goes past the limit (201 by default). The last player standing wins the pot.
- **Platform:** Firebase on the Blaze plan — Firestore, Firebase Authentication (Google sign-in), Firebase Hosting, and Cloud Functions where needed.
- **Cost target:** $0/month by staying inside the no-cost quotas included in Blaze. No file uploads (Cloud Storage) in v1.
- **Security posture:** deliberately light. League members are trusted; controls prevent mistakes, not abuse.

## Leagues, access and invites

Everything lives inside a league: players, games, rounds, stats and trends.

- Any signed-in user can create a league and becomes its admin.
- A user can belong to several leagues and switch between them.
- **Your leagues:** the home screen is a title with a greeting and the profile icon, a count of leagues, and a large card for each league: its name, how many players it has (people who can be picked for a game: not retired, a guest merged into a member counted once) and when it was last played. A league with a game in progress is marked "Game in progress" and outlined, and sorts first, then the most recently played. All of it updates live, and a number shows only once it has loaded. New league and Join with a code are two buttons under the cards that open a small popup each; with no leagues yet they sit in the invitation to start a first one.
- **Joining:** the admin shares an invite link or short code. Opening it and signing in with Google adds the user as a member.
- **Invite page:** opening an invite link shows which league it is for and how many people are in it (nothing more) before signing in, and says so plainly when the link is no longer valid. After signing in, the join page uses the name from the profile and only asks for one if there is none. If nobody is waiting to be claimed, the new member goes straight to the league.
- **First game:** a league with no games points at the next step: Start your first game, or Add players when there are fewer than two.
- **Install prompt:** a one-time card offers Add to home screen (an Add button where the browser supports it, and Share then Add to Home Screen instructions on iPhone). It is left out once installed or dismissed.
- **Admin role is minimal:** replace the invite (invalidating old links) and remove members. Nothing else is admin-only. Any member can invite people: the invite link and code are on the Players tab for everyone.
- **One Players tab for people:** the league has three tabs, Games, Stats and Players. The Players tab lists everyone, members and guests together, with badges (Admin, You, Member, Former member, Guest, Retired). Add player and Invite (the link, the code and a Copy button for any member, plus New invite for the admin) are buttons at the top that open a popup. Each row has a "…" menu with Rename, Retire or Bring back and, for the admin on another member, Remove from league. A guest row also has Link to a member. Removing a member takes away their access and retires their profile; their games and stats stay, and they show as a former member.
- **Members** can start and delete games, log and edit rounds, scrap rounds, mark payments as paid, add guest players, and link or unlink guest profiles.
- Firestore security rules ensure only league members can read or write that league's data.

## Players, guests and merging

- **Guest players:** any member can add a player by name. Guests play, score, win and settle like anyone else, but can't log in.
- Players can be renamed or retired (hidden from new games, kept in history and stats).
- **Claim on join:** a new member sees unclaimed guest profiles and can pick "That's me". The merge happens immediately, with no approval step.
- **Link later:** any member can link a guest profile to a member, or undo a wrong merge.
- **Carry-over:** a merge moves all games, rounds, drops, rejoins, wins and money to the member profile; stats recalculate. Round data is never rewritten: the guest profile is marked `mergedInto` the member profile, and readers resolve ids through that link (see Technical design).
- **Merging two profiles:** if the member already has history, both histories combine.
- **Consistency guard:** a merge is blocked if both profiles played in the same game.
- Every merge and unmerge is logged in the league history.

## Game setup and settings

Starting a game means picking players, setting the rules below, and ordering the table. All settings are per game and lock once the first round is entered.

| Setting               | Default | Notes                                                                                                       |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| Elimination limit     | 201     | A player is out once their total goes past this                                                             |
| Buy-in (bet)          | $10     | Paid by every player; also the cost to rejoin                                                               |
| Drop points           | 20      | Penalty for dropping before playing                                                                         |
| Middle drop points    | 40      | Penalty for dropping after playing                                                                          |
| Max drops per player  | 2       | Drops and middle drops both count toward it                                                                 |
| Drops on rejoin       | Grant 0 | Either grant a set number of drops (0 up to the max drops), or carry over the drops left before elimination |
| Max penalty per round | 80      | Full-count cap; round entry rejects higher values. Blank means no cap                                       |
| Rejoin cutoff         | Off     | Optional score; no rejoin once the highest active score passes it. Blank means rejoin is always allowed     |

- The buy-in is the same for every player within a game.
- On the new game screen, who is playing and the order they sit in are one section: players are tapped in, reordered with arrows, or removed, with Select all as a shortcut. The elimination limit and buy-in are always visible; the other rules sit under "More rules", which shows a one-line summary of them while closed.
- The pot starts at buy-in × players and grows with each rejoin.

## Seating order and dealer rotation

1. Each player draws a card at the table. In the app, members put the players in the order the cards are dealt, highest card first, using the up and down arrows. The app does not take card values or run redraws.
2. The player at the bottom of the list, with the lowest card, is the round 1 dealer. The player at the top gets the first card dealt.
3. The dealer moves to the next seat each round, so after the bottom player the deal passes to the top of the list and down.

Example: draws of K, 9, 6 and 3 are listed K, 9, 6, 3. The player with the 3 deals round 1, the player with the K gets the first card, and the next round is dealt by the player with the K.

The game stores its seat order starting at the dealer (here 3, K, 9, 6), which is the same circle as the list. The engine still has a helper that turns card draws, including redraws for ties, into a seat order, but the app does not use it.

- Eliminated players are skipped as dealer.
- A rejoining player is placed in the order manually at the time of rejoin.
- Scrapping rounds rolls the dealer back with them.
- The round entry screen shows the current dealer and who plays first, and lists players in seat order.

## Rounds, drops, elimination and rejoin

**Round entry**

- Mark the round winner, who scores 0. An ordinary round has exactly one winner, so at least one player always stays under the limit.
- For everyone else, enter penalty points, or tap Drop or Middle drop to apply the configured points.
- Each player shows drops remaining (e.g. "1 of 2 left"). At the limit, drop buttons are disabled and actual points must be entered.
- Drop usage is stored per round, so edits and scraps recalculate it correctly.
- **Quick entry:** the points boxes open the number keypad, picking the winner puts the cursor in the first box that needs points, and Next or Enter moves along the boxes and then to Save (nothing is saved until Save is pressed). Each player also has one-tap Drop, Middle drop and Max (the game's max penalty, left out when there is no cap).
- **Preview before saving:** under each player the form shows their new total as their points go in, marks anyone who would go out or finish close to the limit, and says when the round would end the game and who would win.
- **Undo:** for a minute after a round is saved, an Undo bar takes it back in one tap with no reason to type. It is a scrap with an automatic reason, so it stays in the list struck through like any scrapped round, and it is only offered while that round is still the latest.

**Penalty rounds**

A round can be entered as a penalty round instead of an ordinary one, when a player makes a mistake such as showing a hand that isn't valid (a wrong show), or any other error.

- Nobody wins a penalty round. One player takes the penalty, and everyone else scores 0.
- The penalty starts at the game's max penalty per round (80 by default) and can be changed, for example to a smaller penalty for a smaller mistake. It can't be more than the cap. If the game has no cap, the points are typed in.
- Players who dropped in that round keep their drop points (and use up the drop), as in any other round. Everyone else who played scores 0.
- Each penalty round records a reason, Wrong show or Other error, shown in the round list.
- It counts as a round in every other way: the deal moves on, a player who goes past the limit is out, and rejoins can follow it. It can be edited, scrapped and restored like any round, and an ordinary round can be changed into a penalty round (and the other way) by editing it.
- A penalty round can't leave the game with nobody in it.

**Elimination**

- A player whose total goes past the limit is marked out and greyed out for later rounds.

**Rejoin**

- An eliminated player can rejoin by paying the buy-in again, which is added to the pot.
- They re-enter at the highest current score among active players, plus one.
- Rejoin is allowed only while that highest score is within the game's rejoin cutoff, if one is set (off by default).
- A rejoin happens between rounds only: it is recorded after a round, and the player scores from the next round. Scrapping a round also removes rejoins recorded after it.
- Drops follow the "Drops on rejoin" setting.
- On rejoin, members place the player in the seating order manually.
- Rejoins are tracked so net money reflects multiple buy-ins.

## Game end and settlement

- **Outright win:** when one player remains, they win the whole pot.
- **Split:** remaining players can agree to end the game and split the pot. The app suggests a split weighted by each player's distance from the limit and their remaining drops: `weight = (limit − total) + dropsLeft × dropPoints`, and each share is weight ÷ sum of weights of the pot. Shares are rounded to whole dollars, with any remainder going to the lowest total. Members can override the amounts.
- A split counts as a shared win, shown separately from outright wins.
- **Settlement:** each player's net for the game is pot share won minus buy-ins paid (including rejoins).
- A night summary shows who owes whom, simplified to the fewest transfers.
- **Payments:** each transfer on a night can be marked paid (and undone) by any member. A mark belongs to that exact payment on that night, so if another game changes the amount, it shows as unpaid again. A night shows "All settled" once every payment is paid and no game that night is still being played.
- **Deleting a game:** any member can delete a game, after a confirmation. Its rounds and results go with it, it stops counting in stats and in who owes whom, and the league log keeps a note of who deleted it and when.

## Sharing and settling up

- **Share scores:** a Share button on a game sends the scores to a chat as a picture: the league and day on a dark header, who won (or the round, for a game still on), and each player's actual score with a race-to-the-limit bar. What each player won or lost is small, under their name, and who pays whom is at the very bottom in a quieter type, so the scores are what stand out. The picture is drawn in the browser and shown in the Share window before it is sent. It goes through the phone's share sheet where that can take a file, and is saved to the device otherwise so it can be attached by hand. There is one Share button for the scores; it sends the picture, and sends the same scores as text only where a browser can't draw it. Each night on the Games tab has a Share button that sends a picture the same way: games won by each player large (most wins highlighted), their money small beside it, and who pays whom last. Both fall back to text only where a browser can't draw the picture.
- **Live view link:** offered for a game being played, not for a finished one (unless a link is still on, so it can be turned off). Any member can switch on a link to a game. Anyone with it can watch the scoreboard and rounds update without signing in, and can't change anything. Turning it off, or deleting the game, stops the link working. The page checks for new rounds every few seconds while the game is on, much less often once it is over, and keeps the last scores on screen if the connection drops.
- **Mark paid:** each payment has a Mark paid button, and a night with more than one payment still to make has Mark all paid, which marks them all at once (together, or not at all). Either can be undone per payment.

## Scrapping rounds

Rounds can be scrapped only from the end of the game, like an undo stack.

- The scrap option appears on the latest round; after scrapping it, the previous round becomes scrappable.
- **Roll back to round N:** scraps every round after N in one step, with one reason.
- Any member can scrap; a short reason is required.
- Scrapping reverses totals, drops used, eliminations, rejoins (and their buy-ins), and dealer position.
- If the scrapped round ended the game, the game reopens and its settlement is reversed.
- Scrapped rounds stay visible, struck through, with who, when and why.
- Scrapped rounds can be restored, in reverse order.

## Stats and trends

All-time by default, with a time filter on every view: this month, this year, or a custom range. No resetting seasons.

Everything is on the one screen, with nothing to open per player:

- **Leaderboard:** net money, games won (shared wins in brackets, for example "4 (1 shared)"), rounds won, and round win % (rounds won as a share of rounds played).
- **Streaks:** the longest run of games won in a row, and who is on a run now (two or more). A run only counts the games a player was in: a game they sat out neither adds to it nor breaks it. A shared win counts as a win. Players tied on a run share it. Hidden when nobody has won two in a row.
- **More stats:** games played, average finishing position, best streak, penalties taken (penalty rounds, see above), drops used and rejoins.
- **One chart** with a switch between net money, games won and rounds won, game by game.
- Penalty rounds count as rounds played by everyone and as a round won by nobody.
- Scrapped rounds are excluded from all stats.
- Games finished before rounds won were tracked have no round numbers. The stats tab asks for those games to be recalculated once (`recomputeLeague`, below), and shows a dash instead of zero until they are.

How the numbers are worked out (all from cached game summaries, never from rounds):

- Only finished games count, filtered by the day the game was started. "This month" starts on the 1st, "last 3 months" starts three months back from today, "this year" starts on 1 January, and a custom range includes both end dates.
- **Win rate** is wins (outright plus shared) divided by games played. Outright and shared wins are also shown separately.
- **Average finish** is the mean finishing position, where 1 is first and tied players share a position; lower is better.
- **Net money** is money won minus every buy-in paid, including rejoins.
- **Trends** are running totals over the games in the chosen range, one point per game. A player's line starts at their first game in the range.
- Charts show the eight most active players over the whole league history, each keeping the same colour whatever the time range. Anyone beyond eight appears in the tables only.

## Sync, history and non-functional

- **Live sync:** open games update in real time on every member's device.
- **Conflicts:** last write wins. Each round shows who last edited it and when.
- **Edit history:** every change to a round keeps its prior values.
- **Mobile-first**, installable as a PWA; works on desktop too.
- **Look and feel:** light theme. The four card suits are the recurring motif: a fan of aces on the sign-in screen, a suit on each league tab, a spinner where the suits light up in turn while loading, and a row of suits on empty screens. On the live game screen each player is a score bar racing toward the limit: green early, amber from 60% of the limit, red from 85%, pulsing from 90%, and greyed out with a short shake when they go out. All motion is short and switches off for people whose device asks to reduce motion. There are no photos or uploaded images, and player avatars were considered and left out for now.
- **Efficient reads:** stats come from cached game summaries, not rereading every round.

## Technical design

**Stack:** TypeScript throughout. React + Vite + Tailwind for the web app (PWA), Recharts for charts, Firebase Auth (Google), Firestore, Cloud Functions (2nd gen), Firebase Hosting.

**Monorepo layout**

- `engine/` — pure game logic shared by web and functions. Replays an ordered list of rounds plus game settings to derive totals, drops remaining, eliminations, rejoins, dealer, pot, winner and settlement. No Firebase imports. Fully unit-tested.
- `data/` — Firestore document types, path helpers, parsers for stored documents, round history helpers, and the game summary builder. Plain data only (timestamps are epoch milliseconds), so it works with both the web and admin SDKs. Also holds the rules tests.
- `web/` — the React app. Uses `engine` for live in-game state and `data` for documents.
- `functions/` — Cloud Functions. Uses the same `engine` and `data`.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json` at the root.

**Cloud Functions**

- `createLeague` (callable): creates the league with the caller as admin and only member, plus the caller's own player profile. Clients can't create leagues directly.
- `joinLeague` (callable): validates an invite code and adds the caller as a member with a profile of their own (or brings back the one they had before being removed). Joining twice is harmless.
- `mergePlayers` / `unmergePlayers` (callable): link a guest profile (a player a member added by hand) to a member's own profile, or undo it. A merge only ever goes from a guest to a member's profile; two member profiles are never merged. It sets or clears `mergedInto` on the guest in one write, after the same-game guard (blocked if the guest and the member, or a guest already merged into them, played in the same game); logs to league history; then recomputes the summaries of the games the guest played. Rounds are never rewritten, so unmerge is a clean reversal.
- `onRoundWrite` (Firestore trigger): replays the game with `engine` and updates the game's `status`, `summary` and `summaryError`. It resolves `mergedInto` ids before writing, so summaries (and therefore all stats) only ever contain resolved member ids. It writes to the game doc, never to rounds, to avoid trigger loops. A second trigger on the game doc recomputes the summary when `split` changes, and skips writes that only touch the function-written fields.
- `removeMember`, `regenerateInvite` (callable): admin-only actions. Removing a member keeps their profile, retired, so their games and stats stay.
- `shareGame` (callable): any member switches a game's read-only link on or off. The link is a random code stored in `shares/{code}` (readable by no client) and on the game as `shareCode`.
- `gameView` (callable, needs no sign-in): the replayed state of a shared game, with the league's name and the players' names, for the page behind the link. It gives away no account ids, nothing about other games, and nothing about the league's other members.
- `inviteInfo` (callable, needs no sign-in): the league name and member count for an invite code, so the invite page can say what it is for. It gives away nothing else.
- `recomputeLeague` (callable): any member can ask for every finished game in the league to be recalculated, which fills in numbers added to summaries later (such as rounds won). It leaves games that are already right alone, so it is safe to repeat.
- `deleteGame` (callable): any member can delete a game and all of its rounds, and a log entry is written. It is a function because clients cannot delete the rounds subcollection.

Everything else (round entry, scrapping, live game view) runs client-side.

**Firestore data model**

- `leagues/{leagueId}` — name, adminUid, inviteCode, memberUids, createdAt.
- `leagues/{id}/players/{playerId}` — name, linkedUid (nullable), retired, mergedInto (nullable), createdBy, createdAt.
- `leagues/{id}/games/{gameId}` — settings, seatOrder (initial), status, createdBy, createdAt, split (nullable, set by members), summary (nullable: outcome, winners, pot, payouts, rounds, per-player net, position, rounds played, rounds won, penalties, drops, rejoins, buy-ins), summaryError (nullable). `status`, `summary` and `summaryError` are written by functions only.
- `leagues/{id}/games/{id}/rounds/{roundId}` — seq, winnerId (null in a penalty round), penalty (nullable: player, points, reason; absent on rounds saved before penalty rounds existed), entries (points or drop type per player), rejoins (player and seat, applied after the round), scrapped {by, at, reason} (nullable), updatedBy, updatedAt, history (one entry per change: who, when, and the previous values). The dealer is not stored; the engine derives it.
- `leagues/{id}/log/{entryId}` — type, by, at, details: merges, unmerges, member changes, deleted games. Written by functions only.
- `leagues/{id}/settled/{day_from_to_amount}` — day, from, to, amount, by, at: a payment marked as paid. The id says exactly which payment on which night, and the rules require it to match. Any member can create or delete one.

**Firestore rules.** Shared game links live in `shares/`, which no client can read or write; only the two share callables touch it. Only league members can read or write a league's data. Clients can add guests, rename or retire players, start games, record a split, and enter, edit, scrap and restore rounds. Every update to a round must append one history entry made by the caller and keep earlier entries unchanged. Everything else (creating leagues, membership, invites, linking and merging, game results, the log) is written by Cloud Functions, which bypass the rules. Rules tests run against the emulator with `npm run test:rules`; the emulator needs Java 21+.

**Repo and CI (GitHub)**

- Private GitHub repo; `main` protected, changes via pull requests.
- GitHub Actions: on PR — install, lint, test, build, deploy to a Hosting preview channel. On merge to main — deploy hosting, functions (only when `functions/` or `engine/` changed), rules and indexes.
- Auth from GitHub to Google Cloud via Workload Identity Federation (no stored keys).
- Local development against the Firebase Emulator Suite (Auth, Firestore, Functions).
- A budget alert on the Google Cloud billing account as a safety net.

## Out of scope and open questions

**Later (v2):** CSV export, head-to-head stats, streaks.

**Out of scope:** file or photo uploads; admin approval for claims and merges.

**Open questions**

- [x] Rejoin entry score: highest active score + 1. Cutoff is a per-game setting, off by default.
- [x] Seating for a rejoining player: placed manually by members at the time of rejoin.
- [x] Split: weighted by distance from the limit plus remaining drops (formula above); the drop weight may be tuned later.
- [x] Full-count cap: per-game setting, default 80.
- [ ] Split tie-break when two players have equal weight and the remainder can't be divided evenly (lowest total wins the remainder; exact ties unresolved).
- [x] Merge approach: hybrid. Rounds stay untouched and `mergedInto` is resolved at read time. The engine takes a `resolveId` function, and the summary writer bakes resolved ids into game summaries.
