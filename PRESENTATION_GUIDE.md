# GuardLoop: simple presentation guide

Use this guide to show GuardLoop to friends. You do not need to explain code. The app is a **local cybersecurity training demo**: it tests only programs running on your own computer.

## Before people arrive

1. Open PowerShell in this project folder.
2. Start the app:

   ```powershell
   npm run dev
   ```

3. Wait until the terminal says the web app is ready, then open [http://localhost:5173](http://localhost:5173).
4. Sign in or create an account. Email verification is part of the login flow.
5. Keep the PowerShell window open. Closing it stops the demo.

If the page does not load, wait a few seconds and refresh. If the start command reports a missing package, complete the one-time setup steps in `README.md` first.

## The 30-second explanation

Say this:

> “GuardLoop is a local demo that shows an AI-assisted security workflow. It checks a safe practice app on my computer, verifies whether a problem is real, applies an approved lab-only defense, tests the defense again, and creates a report. It never scans public websites.”

Point out the **Local only** / **Mock mode** or **Live agents** badge in the top bar. Mock mode is still a valid presentation: it runs a predictable demonstration without needing an AI-provider key.

## The main demo: run a scan

1. Click **Start** in the top-right corner.
2. Leave **GuardLoop bundled lab** selected. The target should be `http://127.0.0.1:5001`.
3. Leave all five local lab probes checked for the fullest demo.
4. Tick **“I am authorized to test this local demo target.”**
5. Click **Start scan**.
6. Stay on **Overview** and watch the five cards and the **Live agent activity** feed update.

### What to say while it runs

| Stage | Plain-English explanation |
| --- | --- |
| **Guard Gate** | Makes sure the target is the approved local lab and enforces the safety limits. |
| **Attack** | Sends a small, pre-approved test to look for a weakness. |
| **Verify & Fix** | Repeats the test. If it is not repeatable, GuardLoop rejects it instead of reporting a false alarm. If it is real, it chooses the matching approved lab fix. |
| **Confirm** | Tests again after the fix, including variations, to check that the fix holds. |
| **Report** | Creates the technical and plain-language result only after verification. |

An event that says **Rejected** is good: it means the system avoided treating an unproven result as a vulnerability. A finding marked **Reported** means the demo verified the mitigation.

## Show the results

After the scan completes:

1. Click **Findings** in the left sidebar to show detected issues and their status.
2. Click **Agents** to show what each agent is responsible for and its latest activity.
3. Click **Reports** to show the final human-readable outcome.

Useful one-line explanation:

> “The important part is that it does not stop at ‘I found something.’ It verifies the evidence, fixes the local lab, and verifies the fix.”

## Optional interactive assistant demo

The **GuardLoop Assistant** panel is on the right side of the screen.

Try one of these messages:

- `What are the agents doing?`
- `Explain the scan stages simply`
- `fix prompt injection`
- `fix XSS`
- `fix SSRF`
- `fix access control`
- `fix rate limiting`

For a fix request, the assistant shows:

1. the exact approved remediation it selected;
2. that the change applies only to `127.0.0.1:5001`;
3. a button labeled **Apply and verify local fix**.

Click that button only when you want to demonstrate the change. The assistant reports the active mitigation level afterward. Then type `/scan`, click **Confirm local scan**, and show that the normal agent pipeline can validate the defensive outcome.

The assistant is intentionally limited. It cannot run arbitrary commands, edit arbitrary files, or scan websites on the internet.

## Useful controls

- **Pause**: temporarily pauses the current scan.
- **Resume**: continues a paused scan.
- **Kill switch**: immediately stops the current scan. Use this if someone asks what happens when you stop it.
- `/status`: in the assistant, summarizes the selected scan.
- `/findings`: lists the safe summary of current findings.
- `/reset`: restores the bundled practice app to its starting state before another demo.

## If somebody asks “is this attacking anything?”

Say:

> “No external system is involved. GuardLoop accepts only loopback targets—the practice app at `127.0.0.1:5001`, and optionally a local Juice Shop container at port 3000. The built-in tests are deliberately constrained, and the lab can be reset.”

## A smooth 3-minute order

1. Give the 30-second explanation.
2. Click **Start** and begin the bundled-lab scan.
3. Explain the five pipeline cards while events appear.
4. Open **Findings**, then **Reports**.
5. Open the assistant and ask “What are the agents doing?”
6. Optionally type `fix XSS`, show the confirmation step, apply it, and explain that the output proves the local mitigation was enabled.

## Reset after presenting

In the assistant, type `/reset`. This resets the bundled lab’s mitigation state so the next presentation starts from the same baseline.
